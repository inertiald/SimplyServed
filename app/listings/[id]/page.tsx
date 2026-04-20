import { notFound } from "next/navigation";
import Link from "next/link";
import { Heart, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ReactBar } from "@/components/ReactBar";
import { BookForm } from "@/components/BookForm";
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <article className="ss-card p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="ss-chip">{listing.category}</span>
            <h1 className="mt-2 text-3xl font-semibold text-white">{listing.title}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-white/60">
              <MapPin size={14} /> by {listing.provider.name}
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
