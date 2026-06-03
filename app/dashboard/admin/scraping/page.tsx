import { prisma } from "@/lib/prisma";
import { ScrapeSource } from "@prisma/client";
import { EnqueueScrapeForm } from "@/components/admin/EnqueueScrapeForm";
import { enabledScrapers } from "@/lib/scrapers/registry";

export const dynamic = "force-dynamic";

export default async function AdminScrapingPage() {
  const [jobs, sourceCounts] = await Promise.all([
    prisma.scrapeJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.businessSource.groupBy({
      by: ["source"],
      _count: true,
    }),
  ]);
  const enabled = enabledScrapers().map((s) => s.source);

  return (
    <div className="flex flex-col gap-6">
      <section className="ss-card p-5">
        <h2 className="text-base font-semibold text-white">Run a scrape</h2>
        <p className="text-xs text-white/60">
          Polite: respects robots.txt + rate limits per host. Disabled sources
          need API keys or env flags (see README).
        </p>
        <div className="mt-3">
          <EnqueueScrapeForm enabledSources={enabled} />
        </div>
      </section>

      <section className="ss-card p-5">
        <h2 className="text-base font-semibold text-white">Source coverage</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {Object.values(ScrapeSource).map((s) => {
            const found = sourceCounts.find((c) => c.source === s);
            return (
              <li
                key={s}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <span className="text-white/80">{s}</span>
                <span className="text-white/50">{found?._count ?? 0}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="ss-card p-5">
        <h2 className="text-base font-semibold text-white">Recent jobs</h2>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-white/50">No jobs yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-xs">
            <thead className="text-white/40">
              <tr>
                <th className="py-1">Source</th>
                <th className="py-1">Target</th>
                <th className="py-1">Status</th>
                <th className="py-1">Seen</th>
                <th className="py-1">Up</th>
                <th className="py-1">Rej</th>
                <th className="py-1">Started</th>
              </tr>
            </thead>
            <tbody className="text-white/70">
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-white/5">
                  <td className="py-1">{j.source}</td>
                  <td className="py-1">{j.target}</td>
                  <td className="py-1">{j.status}</td>
                  <td className="py-1">{j.itemsSeen}</td>
                  <td className="py-1">{j.itemsUpserted}</td>
                  <td className="py-1">{j.itemsRejected}</td>
                  <td className="py-1">
                    {j.startedAt ? new Date(j.startedAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
