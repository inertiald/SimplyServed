import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Merge review queue.
 *
 * Today this is a read-only surface — the runner auto-merges ≥0.9 confidence
 * and creates separate profiles otherwise. A future iteration can add
 * manual merge/split actions.
 */
export default async function AdminMergesPage() {
  const candidates = await prisma.businessProfile.findMany({
    where: {
      claimStatus: "UNCLAIMED",
      tombstonedAt: null,
      confidenceScore: { lt: 0.9 },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { sources: true } } },
  });

  return (
    <section className="ss-card p-5">
      <h2 className="text-base font-semibold text-white">Possible duplicates</h2>
      <p className="text-xs text-white/60">
        Profiles with low merge confidence — review and decide manually.
      </p>
      {candidates.length === 0 ? (
        <p className="mt-2 text-sm text-white/50">Nothing to review.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {candidates.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3"
            >
              <div>
                <Link
                  href={`/businesses/${p.slug}`}
                  className="font-medium text-white hover:text-indigo-300"
                >
                  {p.name}
                </Link>
                <div className="text-xs text-white/50">
                  {[p.city, p.region].filter(Boolean).join(", ") || "—"} ·{" "}
                  confidence {p.confidenceScore.toFixed(2)} · {p._count.sources} sources
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
