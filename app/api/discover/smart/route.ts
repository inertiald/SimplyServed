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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const postItems: UnscaledPostFeedItem[] = rawPosts.map((p: any) => ({
    kind: "post",
    id: p.id,
    createdAt: p.createdAt,
    h3Neighborhood: p.h3Neighborhood,
    postType: p.postType,
    contentText: p.contentText,
    user: p.user,
    listing: p.listing,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listingItems: UnscaledListingFeedItem[] = rawListings.map((l: any) => ({
    kind: "listing",
    id: l.id,
    createdAt: l.createdAt,
    h3Neighborhood: l.h3Neighborhood,
    title: l.title,
    description: l.description,
    category: l.category,
    hourlyRate: l.hourlyRate,
    ratingAvg: l.ratingAvg,
    ratingCount: l.ratingCount,
    impressionCount: l._count.impressions,
    requestCount: l._count.requests,
    provider: l.provider,
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
    feed,
  });
}
