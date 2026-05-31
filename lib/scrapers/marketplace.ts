/**
 * Marketplace / storefront price adapters.
 *
 * A single, polite, config-driven adapter family that enriches a business with
 * its advertised prices + hero imagery from a public storefront URL. It powers
 * three registered sources that share identical mechanics but differ in the
 * channel they represent:
 *
 *   - `website`  → the company's OWN site (DIRECT channel)   [SCRAPE_WEBSITE_OFFERS=1]
 *   - `doordash` → DoorDash store page    (DOORDASH channel) [SCRAPE_DOORDASH=1]
 *   - `angi`     → Angi pro page          (ANGI channel)     [SCRAPE_ANGI=1]
 *
 * Each `ScrapeJob.target` is simply the storefront URL to read. We fetch it
 * through `politeFetch` (robots.txt + rate limit honored) and read only the
 * public schema.org JSON-LD the page already exposes to search engines — never
 * private content. All parsing lives in the pure `jsonld` module so it stays
 * unit tested; this file only wires fetch + Prisma-bound shapes together.
 */
import type { PriceChannel, ScrapeSource } from "@prisma/client";
import { politeFetch } from "./http";
import {
  extractBusinessCore,
  extractMedia,
  extractPriceQuotes,
} from "./jsonld";
import type {
  CandidatePriceQuote,
  DiscoverResult,
  NormalizedBusiness,
  RawBusiness,
  Scraper,
  ScraperTarget,
} from "./types";

interface StorefrontPayload {
  url: string;
  channel: PriceChannel;
  core: ReturnType<typeof extractBusinessCore>;
  quotes: CandidatePriceQuote[];
  images: string[];
}

interface MarketplaceConfig {
  id: string;
  source: ScrapeSource;
  channel: PriceChannel;
  /** Env var that enables this adapter (defense against surprise fetches). */
  enabledEnv: string;
  /** Restrict targets to these hosts (suffix match); empty = any host. */
  hosts?: string[];
}

function hostAllowed(url: URL, hosts?: string[]): boolean {
  if (!hosts || hosts.length === 0) return true;
  const host = url.host.toLowerCase().replace(/^www\./, "");
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

export function createMarketplaceScraper(cfg: MarketplaceConfig): Scraper {
  return {
    id: cfg.id,
    source: cfg.source,
    enabled() {
      return process.env[cfg.enabledEnv] === "1";
    },
    async discover(target: ScraperTarget): Promise<DiscoverResult> {
      let url: URL;
      try {
        url = new URL(target.target);
      } catch {
        return { items: [] };
      }
      if (!hostAllowed(url, cfg.hosts)) return { items: [] };
      try {
        const res = await politeFetch(url.toString(), { perHostRps: 1 });
        const html = await res.text();
        const core = extractBusinessCore(html);
        const quotes = extractPriceQuotes(html).map((q) => ({
          ...q,
          channel: cfg.channel,
        }));
        const images = extractMedia(html)
          .map((m) => m.url)
          .slice(0, 6);
        const payload: StorefrontPayload = {
          url: url.toString(),
          channel: cfg.channel,
          core,
          quotes,
          images,
        };
        return {
          items: [
            {
              source: cfg.source,
              sourceUrl: url.toString(),
              externalId: url.toString(),
              payload,
            },
          ],
        };
      } catch {
        // Fetch/robots/rate-limit failures bubble up as "nothing discovered";
        // the runner records the job outcome. Never throw on a single URL.
        return { items: [] };
      }
    },
    normalize(raw: RawBusiness): NormalizedBusiness | null {
      const p = raw.payload as StorefrontPayload;
      if (!p || !p.core) return null;
      const name = p.core.name;
      // A storefront with neither a name nor any price isn't worth a profile.
      if (!name && p.quotes.length === 0) return null;
      return {
        source: raw.source,
        sourceUrl: raw.sourceUrl ?? p.url,
        externalId: p.url,
        name: name ?? "Unknown business",
        description: p.core.description,
        phone: p.core.phone,
        website: p.core.website ?? p.url,
        address: p.core.address,
        city: p.core.city,
        region: p.core.region,
        postalCode: p.core.postalCode,
        country: p.core.country,
        lat: p.core.lat,
        lng: p.core.lng,
        rating: p.core.rating,
        reviewCount: p.core.reviewCount,
        media: p.images.map((url) => ({ kind: "IMAGE" as const, url })),
        priceQuotes: p.quotes.map((q) => ({ ...q, url: q.url ?? p.url })),
      };
    },
  };
}

export const websiteScraper = createMarketplaceScraper({
  id: "website",
  source: "WEBSITE",
  channel: "DIRECT",
  enabledEnv: "SCRAPE_WEBSITE_OFFERS",
});

export const doordashScraper = createMarketplaceScraper({
  id: "doordash",
  source: "DOORDASH",
  channel: "DOORDASH",
  enabledEnv: "SCRAPE_DOORDASH",
  hosts: ["doordash.com"],
});

export const angiScraper = createMarketplaceScraper({
  id: "angi",
  source: "ANGI",
  channel: "ANGI",
  enabledEnv: "SCRAPE_ANGI",
  hosts: ["angi.com", "angieslist.com"],
});
