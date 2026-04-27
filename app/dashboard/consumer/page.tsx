import Link from "next/link";
import { Search, ShoppingBag } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getWalletSummary } from "@/lib/wallet";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { RequestActions } from "@/components/RequestActions";
import { WalletCard } from "@/components/WalletCard";
import { MessageThread } from "@/components/MessageThread";
import { ReviewForm } from "@/components/ReviewForm";
import { RatingStars } from "@/components/RatingStars";

export const dynamic = "force-dynamic";

export default async function ConsumerDashboard() {
  const user = await requireUser();

  const [requests, wallet] = await Promise.all([
    prisma.serviceRequest.findMany({
      where: { consumerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        listing: { select: { id: true, title: true, hourlyRate: true, category: true } },
        review: { select: { rating: true, body: true } },
        _count: { select: { messages: true } },
      },
      take: 50,
    }),
    getWalletSummary(user.id),
  ]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex flex-col gap-4">
      {requests.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No requests yet"
          description="Find a service in your neighborhood to get started."
          action={
            <Link href="/listings" className="ss-btn-primary text-sm">
              <Search size={14} /> Browse listings
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => {
            const fees = (r.feeDetails ?? {}) as Record<string, unknown>;
            return (
              <li key={r.id} className="ss-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/listings/${r.listing.id}`} className="text-base font-semibold text-white hover:text-indigo-300">
                      {r.listing.title}
                    </Link>
                    <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
                      <StatusBadge status={r.status} />
                      <span>· {r.listing.category}</span>
                      {r.scheduledDate && (
                        <span>· {new Date(r.scheduledDate).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-white">
                      ${typeof fees.total === "number" ? fees.total.toFixed(2) : "—"}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40">total</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
                  <div className="text-xs text-white/50">
                    Updated {new Date(r.updatedAt).toLocaleString()}
                  </div>
                  <RequestActions requestId={r.id} status={r.status} role="consumer" />
                </div>
                <div className="mt-3 border-t border-white/5 pt-3">
                  <MessageThread requestId={r.id} initialCount={r._count.messages} />
                </div>
                {r.status === "COMPLETED" && (
                  <div className="mt-3 border-t border-white/5 pt-3">
                    {r.review ? (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-emerald-200">
                            Your review
                          </span>
                          <RatingStars value={r.review.rating} size={11} showCount={false} />
                        </div>
                        {r.review.body && (
                          <p className="mt-1 text-xs text-white/70">{r.review.body}</p>
                        )}
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] text-white/50 hover:text-white/80">
                            Edit
                          </summary>
                          <div className="mt-2">
                            <ReviewForm
                              requestId={r.id}
                              initialRating={r.review.rating}
                              initialBody={r.review.body ?? ""}
                            />
                          </div>
                        </details>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                        <div className="text-xs font-medium text-amber-200">
                          How was it? Leave a review
                        </div>
                        <div className="mt-2">
                          <ReviewForm requestId={r.id} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </div>
      <WalletCard
        consumerBalance={wallet.consumerBalance}
        providerBalance={wallet.providerBalance}
        recent={wallet.recent.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
