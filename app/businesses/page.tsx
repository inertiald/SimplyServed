import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/EmptyState";
import { Search, ShieldQuestion } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Unclaimed `BusinessProfile` directory.
 *
 * These are net-new businesses we discovered via OSINT scraping. They aren't
 * bookable yet — only listed for discovery + claim. Owners convert them into
 * full `Listing`s via the claim flow.
 */
export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string }>;
}) {
  const { q, city } = await searchParams;

  const profiles = await prisma.businessProfile.findMany({
    where: {
      claimStatus: { in: ["UNCLAIMED", "PENDING"] },
      tombstonedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(city ? { city: { equals: city, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ ratingCount: "desc" }, { createdAt: "desc" }],
    take: 60,
    include: { _count: { select: { sources: true, media: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Discovered businesses</h1>
        <p className="text-sm text-white/60">
          Aggregated from public sources. Owners — claim your listing to take it over.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2" method="get">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-3 text-white/40" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search businesses…"
            className="ss-input pl-9"
          />
        </div>
        <button className="ss-btn-primary" type="submit">Search</button>
      </form>

      {profiles.length === 0 ? (
        <EmptyState
          icon={ShieldQuestion}
          title="No discovered businesses yet"
          description="Run a scrape job (admin → scraping) to seed the directory."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <Link
              key={p.id}
              href={`/businesses/${p.slug}`}
              className="ss-card group flex flex-col gap-2 p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.05]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="ss-chip">{p.category ?? "Local business"}</span>
                <span className="ss-chip text-xs">Unverified</span>
              </div>
              <h3 className="text-base font-semibold text-white group-hover:text-indigo-300">
                {p.name}
              </h3>
              {p.description && (
                <p className="line-clamp-2 text-sm text-white/60">{p.description}</p>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 text-xs text-white/50">
                <span>
                  {[p.city, p.region].filter(Boolean).join(", ") || "—"}
                </span>
                <span>
                  {p._count.sources} src · {p._count.media} media
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
