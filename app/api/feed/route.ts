import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { neighborhoodCellsAround } from "@/lib/h3";

export const dynamic = "force-dynamic";

/**
 * Cursor-paginated post feed for one or many H3 neighborhood cells.
 * Query: ?h3=cell&cursor=postId  OR  ?lat=&lng=&ring=1
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const h3 = searchParams.get("h3");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const ring = Number(searchParams.get("ring") ?? "1");
  const cursor = searchParams.get("cursor");
  const take = Math.min(Number(searchParams.get("take") ?? "20"), 50);

  let cells: string[];
  if (h3) {
    cells = h3.split(",").filter(Boolean);
  } else if (lat && lng) {
    const latN = Number(lat);
    const lngN = Number(lng);
    if (Number.isNaN(latN) || Number.isNaN(lngN)) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }
    cells = neighborhoodCellsAround(latN, lngN, Math.min(Math.max(ring, 0), 4));
  } else {
    return NextResponse.json(
      { error: "Provide either ?h3=<cell[,cell]> or ?lat=&lng=" },
      { status: 400 },
    );
  }

  const posts = await prisma.post.findMany({
    where: { h3Neighborhood: { in: cells }, status: "ACTIVE" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      listing: { select: { id: true, title: true, category: true } },
    },
  });

  const hasMore = posts.length > take;
  const slice = hasMore ? posts.slice(0, take) : posts;
  const nextCursor = hasMore ? slice[slice.length - 1].id : null;

  return NextResponse.json({ posts: slice, nextCursor, cells });
}
