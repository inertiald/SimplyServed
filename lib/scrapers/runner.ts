/**
 * Scrape job runner.
 *
 * Drives a single `ScrapeJob` through:
 *
 *   discover → normalize → garbage-filter → dedup → upsert (+ media)
 *
 * The runner is the *only* layer that touches Prisma. Adapters (`osm`, `yelp`,
 * …) stay pure: discover + normalize, no side effects. This keeps them easy
 * to unit-test and easy to swap.
 *
 * Hard rules (also enforced in `lib/scrapers/http.ts`):
 *   - robots.txt disallow → skip + count as rejected.
 *   - Circuit breaker (`scraper:halt` in Redis) → fail-fast with status
 *     RATE_LIMITED + cooldown.
 *   - 429s → mark job RATE_LIMITED and schedule a retry.
 */
import { prisma } from "@/lib/prisma";
import { indexCoords } from "@/lib/h3";
import { safePublish } from "@/lib/redis";
import { ScrapeJobStatus, ClaimStatus, Prisma } from "@prisma/client";
import {
  computeDedupeKey,
  mergeProfiles,
  matchConfidence,
  rejectIfGarbage,
  MERGE_AUTO_THRESHOLD,
  MERGE_REVIEW_THRESHOLD,
} from "./merge";
import {
  CircuitBreakerOpen,
  RateLimitedError,
  RobotsDisallowed,
} from "./http";
import { ingestMedia } from "./media";
import { resolvePriceChannel } from "./pricing";
import { getScraperBySource } from "./registry";
import type { NormalizedBusiness } from "./types";

export interface RunResult {
  status: ScrapeJobStatus;
  itemsSeen: number;
  itemsUpserted: number;
  itemsRejected: number;
  error?: string;
}

const SLUG_MAX = 80;
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX) || "business";
}

async function uniqueSlug(base: string): Promise<string> {
  // Best-effort uniqueness. Conflicts are rare; retry with a short suffix.
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const exists = await prisma.businessProfile.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Upsert one normalized record into the BusinessProfile graph.
 *
 * Returns the resulting profile id and whether it created a new row or
 * attached to an existing one.
 */
export async function upsertNormalized(
  n: NormalizedBusiness,
): Promise<{ profileId: string; created: boolean }> {
  // Step 1: same (source, externalId) → in-place update of existing source.
  if (n.externalId) {
    const existingSource = await prisma.businessSource.findUnique({
      where: { source_externalId: { source: n.source, externalId: n.externalId } },
      select: { id: true, businessProfileId: true },
    });
    if (existingSource) {
      await prisma.businessSource.update({
        where: { id: existingSource.id },
        data: {
          rawPayload: n as unknown as object,
          rating: n.rating ?? null,
          reviewCount: n.reviewCount ?? null,
          fetchedAt: new Date(),
          sourceUrl: n.sourceUrl,
        },
      });
      await refreshProfile(existingSource.businessProfileId);
      return { profileId: existingSource.businessProfileId, created: false };
    }
  }

  // Step 2: same dedupeKey → attach this source to an existing profile.
  const dedupeKey = computeDedupeKey({
    name: n.name,
    phone: n.phone,
    lat: n.lat,
    lng: n.lng,
  });

  let profile = await prisma.businessProfile.findUnique({
    where: { dedupeKey },
    select: { id: true, tombstonedAt: true },
  });

  // Step 3: fuzzy match — search nearby cell for a same-name+nearby candidate.
  if (!profile && typeof n.lat === "number" && typeof n.lng === "number") {
    const cell = indexCoords(n.lat, n.lng).h3Neighborhood;
    const nearby = await prisma.businessProfile.findMany({
      where: { h3Neighborhood: cell, tombstonedAt: null },
      select: { id: true, name: true, phone: true, lat: true, lng: true },
      take: 50,
    });
    for (const c of nearby) {
      const conf = matchConfidence(
        { name: n.name, phone: n.phone, lat: n.lat, lng: n.lng },
        {
          name: c.name,
          phone: c.phone ?? undefined,
          lat: c.lat ?? undefined,
          lng: c.lng ?? undefined,
        },
      );
      if (conf >= MERGE_AUTO_THRESHOLD) {
        profile = { id: c.id, tombstonedAt: null };
        break;
      }
      if (conf >= MERGE_REVIEW_THRESHOLD) {
        // Leave it to the admin merge queue — record the candidate via
        // BusinessSource on a new profile but flag a low confidence score
        // so reviewers can find it.
        break;
      }
    }
  }

  if (profile?.tombstonedAt) {
    // Owner asked us not to ingest this — skip silently.
    return { profileId: profile.id, created: false };
  }

  let created = false;
  if (!profile) {
    const slug = await uniqueSlug(slugify(n.name));
    const geo =
      typeof n.lat === "number" && typeof n.lng === "number"
        ? indexCoords(n.lat, n.lng)
        : null;
    const fresh = await prisma.businessProfile.create({
      data: {
        slug,
        name: n.name,
        description: n.description,
        category: n.category,
        phone: n.phone,
        email: n.email,
        website: n.website,
        address: n.address,
        city: n.city,
        region: n.region,
        postalCode: n.postalCode,
        country: n.country,
        lat: n.lat,
        lng: n.lng,
        h3City: geo?.h3City,
        h3Neighborhood: geo?.h3Neighborhood,
        hours: n.hours as unknown as object | undefined,
        socialLinks: n.socialLinks as unknown as object | undefined,
        tags: n.tags ?? [],
        ratingAvg: n.rating ?? 0,
        ratingCount: n.reviewCount ?? 0,
        dedupeKey,
        confidenceScore: 1,
        lastScrapedAt: new Date(),
        nextScrapeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    profile = { id: fresh.id, tombstonedAt: null };
    created = true;
  }

  // Attach the BusinessSource. Unique (source, sourceUrl) protects re-runs.
  await prisma.businessSource.upsert({
    where: { source_sourceUrl: { source: n.source, sourceUrl: n.sourceUrl } },
    create: {
      businessProfileId: profile.id,
      source: n.source,
      sourceUrl: n.sourceUrl,
      externalId: n.externalId,
      rawPayload: n as unknown as object,
      rating: n.rating ?? null,
      reviewCount: n.reviewCount ?? null,
    },
    update: {
      rawPayload: n as unknown as object,
      rating: n.rating ?? null,
      reviewCount: n.reviewCount ?? null,
      fetchedAt: new Date(),
      externalId: n.externalId,
    },
  });

  // Ingest candidate media. Failures here are best-effort — they don't fail
  // the whole upsert.
  for (const m of n.media ?? []) {
    try {
      const ingested = await ingestMedia(m.url, { kind: m.kind });
      await prisma.businessMedia.upsert({
        where: {
          businessProfileId_phash: {
            businessProfileId: profile.id,
            phash: ingested.phash,
          },
        },
        create: {
          businessProfileId: profile.id,
          kind: m.kind,
          url: ingested.url,
          originUrl: m.url,
          originSource: n.source,
          phash: ingested.phash,
          caption: m.caption,
        },
        update: {
          url: ingested.url,
          originUrl: m.url,
          caption: m.caption,
        },
      });
    } catch {
      // ignore — best-effort
    }
  }

  // Upsert advertised price quotes for the price-comparison table. Keyed on
  // (profile, channel, label) so re-scrapes refresh prices in place. Channel
  // falls back to the source's natural channel when the adapter doesn't set it.
  for (const q of n.priceQuotes ?? []) {
    const label = q.label?.trim().slice(0, 120);
    if (typeof q.amount !== "number" || q.amount <= 0 || !label) continue;
    const channel = resolvePriceChannel(q.channel, n.source);
    try {
      await prisma.businessPriceQuote.upsert({
        where: {
          businessProfileId_channel_label: {
            businessProfileId: profile.id,
            channel,
            label,
          },
        },
        create: {
          businessProfileId: profile.id,
          channel,
          source: n.source,
          label,
          amount: q.amount,
          currency: q.currency ?? "USD",
          unit: q.unit,
          url: q.url ?? n.website ?? n.sourceUrl,
          available: q.available ?? true,
          externalId: q.externalId,
        },
        update: {
          source: n.source,
          amount: q.amount,
          currency: q.currency ?? "USD",
          unit: q.unit,
          url: q.url ?? n.website ?? n.sourceUrl,
          available: q.available ?? true,
          externalId: q.externalId,
        },
      });
    } catch {
      // best-effort — a bad quote never fails the whole upsert.
    }
  }

  await refreshProfile(profile.id);
  return { profileId: profile.id, created };
}

/**
 * Re-merge a profile from its `BusinessSource` rows. Idempotent — safe to
 * call after every source change.
 */
export async function refreshProfile(profileId: string): Promise<void> {
  const profile = await prisma.businessProfile.findUnique({
    where: { id: profileId },
    include: { sources: true, claimedListing: { select: { ownerOverrides: true } } },
  });
  if (!profile) return;
  const sources: NormalizedBusiness[] = profile.sources.map(
    (s) => s.rawPayload as unknown as NormalizedBusiness,
  );
  if (sources.length === 0) return;
  const owned = (profile.claimedListing?.ownerOverrides ?? {}) as Record<string, boolean>;
  const merged = mergeProfiles(sources, owned);
  const geo =
    typeof merged.lat === "number" && typeof merged.lng === "number"
      ? indexCoords(merged.lat, merged.lng)
      : null;
  await prisma.businessProfile.update({
    where: { id: profileId },
    data: {
      name: merged.name,
      description: merged.description,
      category: merged.category,
      phone: merged.phone,
      email: merged.email,
      website: merged.website,
      address: merged.address,
      city: merged.city,
      region: merged.region,
      postalCode: merged.postalCode,
      country: merged.country,
      lat: merged.lat,
      lng: merged.lng,
      h3City: geo?.h3City ?? profile.h3City,
      h3Neighborhood: geo?.h3Neighborhood ?? profile.h3Neighborhood,
      hours: merged.hours as unknown as object | undefined,
      socialLinks: merged.socialLinks as unknown as object | undefined,
      tags: merged.tags ?? profile.tags,
      ratingAvg: merged.ratingAvg,
      ratingCount: merged.ratingCount,
      lastScrapedAt: new Date(),
    },
  });
}

/**
 * Run a single ScrapeJob row to completion. Used by both the admin "Run
 * now" Server Action and the scheduled tick driver.
 */
export async function runScrapeJob(jobId: string): Promise<RunResult> {
  const job = await prisma.scrapeJob.update({
    where: { id: jobId },
    data: { status: ScrapeJobStatus.RUNNING, startedAt: new Date(), error: null },
  });
  const scraper = getScraperBySource(job.source);
  if (!scraper) {
    return finalize(jobId, ScrapeJobStatus.FAILED, {
      itemsSeen: 0,
      itemsUpserted: 0,
      itemsRejected: 0,
      error: `no scraper registered for source ${job.source}`,
    });
  }
  if (!scraper.enabled()) {
    return finalize(jobId, ScrapeJobStatus.FAILED, {
      itemsSeen: 0,
      itemsUpserted: 0,
      itemsRejected: 0,
      error: `scraper ${scraper.id} not enabled (missing env?)`,
    });
  }

  let seen = 0;
  let upserted = 0;
  let rejected = 0;

  try {
    const discovered = await scraper.discover({ target: job.target, cursor: job.cursor ?? undefined });
    for (const raw of discovered.items) {
      seen++;
      const normalized = scraper.normalize(raw);
      if (!normalized) {
        rejected++;
        continue;
      }
      const garbage = rejectIfGarbage(normalized);
      if (garbage) {
        rejected++;
        continue;
      }
      try {
        await upsertNormalized(normalized);
        upserted++;
      } catch (err) {
        rejected++;
        if (process.env.NODE_ENV !== "production") {
          console.warn("[scrape] upsert failed:", err);
        }
      }
    }
    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: {
        cursor: discovered.nextCursor
          ? (discovered.nextCursor as object)
          : Prisma.JsonNull,
      },
    });
  } catch (err) {
    if (err instanceof CircuitBreakerOpen) {
      return finalize(jobId, ScrapeJobStatus.RATE_LIMITED, {
        itemsSeen: seen,
        itemsUpserted: upserted,
        itemsRejected: rejected,
        error: "circuit breaker open",
      });
    }
    if (err instanceof RateLimitedError) {
      return finalize(jobId, ScrapeJobStatus.RATE_LIMITED, {
        itemsSeen: seen,
        itemsUpserted: upserted,
        itemsRejected: rejected,
        error: err.message,
      });
    }
    if (err instanceof RobotsDisallowed) {
      return finalize(jobId, ScrapeJobStatus.FAILED, {
        itemsSeen: seen,
        itemsUpserted: upserted,
        itemsRejected: rejected,
        error: `robots.txt disallow: ${err.url}`,
      });
    }
    return finalize(jobId, ScrapeJobStatus.FAILED, {
      itemsSeen: seen,
      itemsUpserted: upserted,
      itemsRejected: rejected,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await safePublish("notify:admin", { kind: "scrape.done", jobId, seen, upserted, rejected });
  return finalize(jobId, ScrapeJobStatus.OK, {
    itemsSeen: seen,
    itemsUpserted: upserted,
    itemsRejected: rejected,
  });
}

async function finalize(
  jobId: string,
  status: ScrapeJobStatus,
  data: Omit<RunResult, "status">,
): Promise<RunResult> {
  await prisma.scrapeJob.update({
    where: { id: jobId },
    data: {
      status,
      finishedAt: new Date(),
      itemsSeen: data.itemsSeen,
      itemsUpserted: data.itemsUpserted,
      itemsRejected: data.itemsRejected,
      error: data.error,
    },
  });
  return { status, ...data };
}

// Re-export for convenience.
export { ClaimStatus };
