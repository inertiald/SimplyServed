import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { neighborhoodCellsAround, indexCoords } from "@/lib/h3";
import { computeScore, type FeedItem, type PostFeedItem, type ListingFeedItem, type UnscaledPostFeedItem, type UnscaledListingFeedItem } from "@/lib/ranking";

export const dynamic = "force-dynamic";

/**
 * Smart Discover Feed — merges nearby posts and listings into a single ranked feed.
 *
 * Query params (same as /api/discover and /api/feed):
 *   ?h3=<cell>                  — single neighbourhood cell
 *   ?lat=<n>&lng=<n>&ring=<0-4> — expand from coordinates (default ring=1)
 *   ?limit=<n>                  — max items to return (default 40, max 100)
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const h3Param = searchParams.get("h3");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const ring = Math.min(Math.max(Number(searchParams.get("ring") ?? "1"), 0), 4);
  const limit = Math.min(Number(searchParams.get("limit") ?? "40"), 100);

  // ── 1. Resolve the set of H3 cells to query ─────────────────────────────
  let cells: string[];
  if (h3Param) {
    cells = [h3Param];
  } else if (lat && lng) {
    const latN = Number(lat);
    const lngN = Number(lng);
    if (Number.isNaN(latN) || Number.isNaN(lngN)) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }
    cells = neighborhoodCellsAround(latN, lngN, ring);
  } else {
    return NextResponse.json(
      { error: "Provide either ?h3=<cell> or ?lat=<n>&lng=<n>" },
      { status: 400 },
    );
  }

  // ── 2. Fetch posts + listings in parallel ────────────────────────────────
  const [rawPosts, rawListings] = await Promise.all([
    prisma.post.findMany({
      where: { h3Neighborhood: { in: cells }, status: "ACTIVE" },
      take: 200,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        listing: { select: { id: true, title: true, category: true } },
      },
    }),
    prisma.listing.findMany({
      where: { h3Neighborhood: { in: cells }, status: "ACTIVE" },
      take: 200,
      orderBy: { createdAt: "desc" },
      include: {
        provider: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { impressions: true, requests: true } },
      },
    }),
  ]);

  // ── 3. Normalise to FeedItem (without score) ─────────────────────────────
  const postItems: UnscaledPostFeedItem[] = rawPosts.map((p) => ({
    kind: "post",
    id: p.id,
    createdAt: p.createdAt,
    h3Neighborhood: p.h3Neighborhood,
    postType: p.postType,
    contentText: p.contentText,
    mediaType: p.mediaType,
    mediaUrls: Array.isArray(p.mediaUrls)
      ? p.mediaUrls.filter((url): url is string => typeof url === "string")
      : null,
    metadata:
      p.metadata && typeof p.metadata === "object"
        ? (p.metadata as UnscaledPostFeedItem["metadata"])
        : null,
    lat: p.lat,
    lng: p.lng,
    user: p.user,
    listing: p.listing,
    rank: rankPost(p.postType),
  }));

  const listingItems: UnscaledListingFeedItem[] = rawListings.map((l) => ({
    kind: "listing",
    id: l.id,
    createdAt: l.createdAt,
    h3Neighborhood: l.h3Neighborhood,
    title: l.title,
    description: l.description,
    category: l.category,
    hourlyRate: l.hourlyRate,
    lat: l.lat,
    lng: l.lng,
    ratingAvg: l.ratingAvg,
    ratingCount: l.ratingCount,
    impressionCount: l._count.impressions,
    requestCount: l._count.requests,
    provider: l.provider,
    rank: rankListing({
      ratingAvg: l.ratingAvg,
      ratingCount: l.ratingCount,
      impressionCount: l._count.impressions,
      requestCount: l._count.requests,
    }),
  }));

  // ── 4. Score + merge + sort ───────────────────────────────────────────────
  const feed: FeedItem[] = [
    ...postItems.map((item) => ({ ...item, score: computeScore(item) } as PostFeedItem)),
    ...listingItems.map((item) => ({ ...item, score: computeScore(item) } as ListingFeedItem)),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // ── 5. Return ─────────────────────────────────────────────────────────────
  return NextResponse.json({
    cells,
    indexHint: lat && lng ? indexCoords(Number(lat), Number(lng)).h3Neighborhood : null,
    total: feed.length,
    timingMs: Date.now() - startedAt,
    feed,
  });
}

function rankPost(postType: string): UnscaledPostFeedItem["rank"] {
  if (postType === "OFFER") {
    return { label: "Trending", reasons: ["Live offer"] };
  }
  if (postType === "BUSINESS") {
    return { label: "Trending", reasons: ["Business update"] };
  }
  return { label: "Recent", reasons: ["Fresh activity nearby"] };
}

function rankListing({
  ratingAvg,
  ratingCount,
  impressionCount,
  requestCount,
}: {
  ratingAvg: number;
  ratingCount: number;
  impressionCount: number;
  requestCount: number;
}): UnscaledListingFeedItem["rank"] {
  if (requestCount >= 5 || impressionCount >= 100) {
    return { label: "Trending", reasons: ["High engagement"] };
  }
  if (ratingAvg >= 4.7 && ratingCount >= 10) {
    return { label: "Highly Rated", reasons: ["Excellent reviews"] };
  }
  if (impressionCount >= 40 || requestCount >= 2) {
    return { label: "Popular Nearby", reasons: ["Popular in your area"] };
  }
  return { label: "Recommended", reasons: ["Strong local fit"] };
}
