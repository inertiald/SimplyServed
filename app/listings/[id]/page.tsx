import { notFound } from "next/navigation";
import Link from "next/link";
import { Heart, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ReactBar } from "@/components/ReactBar";
import { BookForm } from "@/components/BookForm";
import { RatingStars } from "@/components/RatingStars";
import { calculateFees } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function ListingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      provider: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { impressions: true, requests: true } },
    },
  });
  if (!listing) notFound();

  const user = await getSessionUser();
  const isOwnListing = user?.id === listing.providerId;
  const fees = calculateFees(listing.hourlyRate, 1);

  const reviews = await prisma.review.findMany({
    where: { listingId: listing.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { author: { select: { name: true } } },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <article className="ss-card p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="ss-chip">{listing.category}</span>
            <h1 className="mt-2 text-3xl font-semibold text-white">{listing.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-white/60">
              <Link
                href={`/u/${listing.provider.id}`}
                className="flex items-center gap-1.5 hover:text-indigo-300"
              >
                <MapPin size={14} /> by {listing.provider.name}
              </Link>
              {listing.ratingCount > 0 && (
                <RatingStars
                  value={listing.ratingAvg}
                  count={listing.ratingCount}
                  size={13}
                />
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold text-white">${listing.hourlyRate}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/50">/ hour</div>
          </div>
        </div>

        <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
          {listing.description}
        </p>

        <div className="mt-6 flex items-center gap-4 border-t border-white/5 pt-5 text-sm text-white/60">
          <span className="flex items-center gap-1.5">
            <Heart size={14} /> {listing._count.impressions} reactions
          </span>
          <span>· {listing._count.requests} requests</span>
          {!isOwnListing && user && <ReactBar listingId={listing.id} />}
        </div>

        {/* REVIEWS */}
        <div className="mt-8 border-t border-white/5 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Reviews</h2>
            {listing.ratingCount > 0 && (
              <RatingStars
                value={listing.ratingAvg}
                count={listing.ratingCount}
                size={14}
              />
            )}
          </div>
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-white/50">
              No reviews yet — be the first after your service is completed.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {reviews.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-white">{r.author.name}</span>
                    <span className="flex items-center gap-2 text-white/50">
                      <RatingStars value={r.rating} size={11} showCount={false} />
                      <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                    </span>
                  </div>
                  {r.body && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-white/80">
                      {r.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>

      <aside className="ss-card flex flex-col gap-3 p-6">
        <h2 className="text-base font-semibold text-white">Book this service</h2>
        <p className="text-xs text-white/50">
          Estimated total for 1 hour:
          <span className="ml-1 font-semibold text-white">${fees.total.toFixed(2)}</span>
          <span className="text-white/40"> (incl. ${fees.platformFee.toFixed(2)} platform fee)</span>
        </p>
        {!user ? (
          <Link href="/sign-in" className="ss-btn-primary">
            Sign in to book
          </Link>
        ) : isOwnListing ? (
          <p className="text-sm text-white/60">This is your listing — manage it from your dashboard.</p>
        ) : (
          <BookForm listingId={listing.id} hourlyRate={listing.hourlyRate} />
        )}
      </aside>
    </div>
  );
}
