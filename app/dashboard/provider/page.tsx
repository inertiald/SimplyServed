import Link from "next/link";
import { Plus, Briefcase } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { RequestActions } from "@/components/RequestActions";

export const dynamic = "force-dynamic";

export default async function ProviderDashboard() {
  const user = await requireUser();

  const [listings, requests] = await Promise.all([
    prisma.listing.findMany({
      where: { providerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { requests: true, impressions: true, posts: true } } },
    }),
    prisma.serviceRequest.findMany({
      where: { listing: { providerId: user.id } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        consumer: { select: { id: true, name: true } },
        listing: { select: { id: true, title: true } },
      },
    }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      {/* LISTINGS */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Your listings</h2>
          <Link href="/dashboard/provider/listings/new" className="ss-btn-primary text-xs">
            <Plus size={12} /> New listing
          </Link>
        </div>

        {listings.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No listings yet"
            description="Publish your first service to start getting requests in your area."
            action={
              <Link href="/dashboard/provider/listings/new" className="ss-btn-primary text-sm">
                <Plus size={14} /> Create listing
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {listings.map((l) => (
              <li key={l.id} className="ss-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/listings/${l.id}`} className="font-semibold text-white hover:text-indigo-300">
                      {l.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-white/50">{l.category} · ${l.hourlyRate}/hr</div>
                  </div>
                  <span className="ss-chip">{l.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <Stat n={l._count.requests} label="requests" />
                  <Stat n={l._count.impressions} label="reactions" />
                  <Stat n={l._count.posts} label="posts" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* REQUESTS */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">Incoming requests</h2>
        {requests.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="Nothing in your queue"
            description="When a neighbor books a service, it'll show up right here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((r) => {
              const fees = (r.feeDetails ?? {}) as Record<string, unknown>;
              return (
                <li key={r.id} className="ss-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">
                        {r.listing.title}{" "}
                        <span className="text-xs font-normal text-white/50">· from {r.consumer.name}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
                        <StatusBadge status={r.status} />
                        {r.scheduledDate && (
                          <span>· {new Date(r.scheduledDate).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-semibold text-white">
                        ${typeof fees.total === "number" ? fees.total.toFixed(2) : "—"}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-white/40">total</div>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-white/5 pt-3">
                    <RequestActions requestId={r.id} status={r.status} role="provider" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-lg bg-white/5 py-1.5">
      <div className="text-sm font-semibold text-white">{n}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}
