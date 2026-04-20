import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { indexCoords, neighborhoodCellsAround } from "@/lib/h3";

export const dynamic = "force-dynamic";

/**
 * Discover active listings around a (lat,lng) or in a specific H3 cell. Falls
 * back to a 1-ring grid disk when only coordinates are supplied.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const h3 = searchParams.get("h3");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const ring = Number(searchParams.get("ring") ?? "1");

  let cells: string[];
  if (h3) {
    cells = [h3];
  } else if (lat && lng) {
    const latN = Number(lat);
    const lngN = Number(lng);
    if (Number.isNaN(latN) || Number.isNaN(lngN)) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }
    cells = neighborhoodCellsAround(latN, lngN, Math.min(Math.max(ring, 0), 4));
  } else {
    return NextResponse.json(
      { error: "Provide either ?h3=<cell> or ?lat=<n>&lng=<n>" },
      { status: 400 },
    );
  }

  const listings = await prisma.listing.findMany({
    where: { h3Neighborhood: { in: cells }, status: "ACTIVE" },
    take: 100,
    orderBy: { createdAt: "desc" },
    include: {
      provider: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { impressions: true, requests: true } },
    },
  });

  return NextResponse.json({
    cells,
    indexHint:
      lat && lng ? indexCoords(Number(lat), Number(lng)).h3Neighborhood : null,
    listings,
  });
}
