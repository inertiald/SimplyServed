import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { haversineMiles, parseDiscoverRadius, parseDiscoverSort } from "@/lib/discover";
import { indexCoords, neighborhoodCellsAround } from "@/lib/h3";

export const dynamic = "force-dynamic";

/**
 * Discover active listings around a (lat,lng) or in a specific H3 cell.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const h3 = searchParams.get("h3");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const ring = parseDiscoverRadius(searchParams.get("ring"));
  const category = searchParams.get("category");
  const maxRate = searchParams.get("maxRate");
  const sort = parseDiscoverSort(searchParams.get("sort"));

  let cells: string[];
  let origin: { lat: number; lng: number } | null = null;
  let bounds:
    | {
        minLat: number;
        maxLat: number;
        minLng: number;
        maxLng: number;
      }
    | null = null;
  if (h3) {
    cells = [h3];
  } else if (lat && lng) {
    const latN = Number(lat);
    const lngN = Number(lng);
    if (Number.isNaN(latN) || Number.isNaN(lngN)) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }
    origin = { lat: latN, lng: lngN };
    const latDelta = ring / 69;
    const lngDelta = ring / Math.max(Math.cos((latN * Math.PI) / 180) * 69, 0.01);
    bounds = {
      minLat: latN - latDelta,
      maxLat: latN + latDelta,
      minLng: lngN - lngDelta,
      maxLng: lngN + lngDelta,
    };
    cells = neighborhoodCellsAround(latN, lngN, 4);
  } else {
    return NextResponse.json(
      { error: "Provide either ?h3=<cell> or ?lat=<n>&lng=<n>" },
      { status: 400 },
    );
  }

  const [rawListings, rawBusinesses] = await Promise.all([
    prisma.listing.findMany({
      where: bounds
        ? {
            status: "ACTIVE",
            lat: { gte: bounds.minLat, lte: bounds.maxLat },
            lng: { gte: bounds.minLng, lte: bounds.maxLng },
          }
        : { h3Neighborhood: { in: cells }, status: "ACTIVE" },
      take: 250,
      orderBy: { createdAt: "desc" },
      include: {
        provider: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { impressions: true, requests: true } },
      },
    }),
    prisma.businessProfile.findMany({
      where: bounds
        ? {
            claimStatus: { in: ["UNCLAIMED", "PENDING"] },
            tombstonedAt: null,
            lat: { gte: bounds.minLat, lte: bounds.maxLat },
            lng: { gte: bounds.minLng, lte: bounds.maxLng },
          }
        : {
            h3Neighborhood: { in: cells },
            claimStatus: { in: ["UNCLAIMED", "PENDING"] },
            tombstonedAt: null,
            lat: { not: null },
            lng: { not: null },
          },
      take: 250,
      orderBy: [{ ratingCount: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        category: true,
        city: true,
        region: true,
        lat: true,
        lng: true,
        h3Neighborhood: true,
        ratingAvg: true,
        ratingCount: true,
        createdAt: true,
      },
    }),
  ]);

  const businessesWithCoords = rawBusinesses.filter(
    (
      business,
    ): business is (typeof rawBusinesses)[number] & { lat: number; lng: number } =>
      business.lat !== null && business.lng !== null,
  );

  const listings = origin
    ? rawListings.filter((listing) => haversineMiles(origin, listing) <= ring)
    : rawListings;
  const businesses = origin
    ? businessesWithCoords.filter((business) => haversineMiles(origin, business) <= ring)
    : businessesWithCoords;

  return NextResponse.json({
    cells,
    indexHint:
      lat && lng ? indexCoords(Number(lat), Number(lng)).h3Neighborhood : null,
    filters: { category, maxRate, sort, ring },
    // Category/maxRate/sort are currently applied client-side in components/VibeMap.tsx.
    // Add indexed backend query support here when discover filtering moves server-side.
    listings,
    businesses,
  });
}
