import { prisma } from "@/lib/prisma";
import { neighborhoodCellsAround } from "@/lib/h3";
import { chat, isOllamaAvailable } from "@/lib/ollama";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/agent/pulse?lat=&lng=
 *
 * Returns a one-paragraph AI summary of what's happening in the user's
 * neighborhood right now, plus the raw counts that fed the prompt. This is a
 * lightweight, non-streaming endpoint — the vibe page polls it once on load.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat") ?? "");
  const lng = Number(searchParams.get("lng") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "Missing lat/lng" }, { status: 400 });
  }

  const cells = neighborhoodCellsAround(lat, lng, 2);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [posts, listings] = await Promise.all([
    prisma.post.findMany({
      where: { h3Neighborhood: { in: cells }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { postType: true, contentText: true, createdAt: true },
    }),
    prisma.listing.findMany({
      where: { h3Neighborhood: { in: cells }, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { title: true, category: true, hourlyRate: true },
    }),
  ]);

  const counts = {
    posts24h: posts.length,
    activeListings: listings.length,
    offers: posts.filter((p) => p.postType === "OFFER").length,
    businesses: posts.filter((p) => p.postType === "BUSINESS").length,
  };

  if (!(await isOllamaAvailable())) {
    return Response.json({
      summary: fallbackSummary(counts),
      counts,
      ollama: false,
    });
  }

  const sample = posts
    .slice(0, 12)
    .map((p) => `- [${p.postType}] ${p.contentText.slice(0, 140)}`)
    .join("\n");
  const cats = countBy(listings.map((l) => l.category));
  const catLine = Object.entries(cats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");

  let summary = "";
  try {
    const res = await chat({
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You write pithy, warm one-paragraph neighborhood briefings. 2 sentences max, ~40 words. No emoji. No bullet lists. No greeting. Mention concrete details from the data.",
        },
        {
          role: "user",
          content: `Recent posts (last 24h):\n${sample || "(none)"}\n\nActive listing categories nearby: ${catLine || "(none)"}`,
        },
      ],
    });
    summary = (res.content ?? "").trim();
  } catch {
    summary = fallbackSummary(counts);
  }
  return Response.json({ summary, counts, ollama: true });
}

function fallbackSummary(c: {
  posts24h: number;
  activeListings: number;
  offers: number;
}): string {
  if (c.posts24h === 0 && c.activeListings === 0) {
    return "Quiet on the block — be the first to post or list something tonight.";
  }
  return `${c.posts24h} fresh post${c.posts24h === 1 ? "" : "s"} in the last 24 hours, ${c.offers} live offer${c.offers === 1 ? "" : "s"}, and ${c.activeListings} active listing${c.activeListings === 1 ? "" : "s"} within a few hex cells.`;
}

function countBy(arr: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of arr) out[x] = (out[x] ?? 0) + 1;
  return out;
}
