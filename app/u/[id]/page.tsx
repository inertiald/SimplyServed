import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin, Star, Briefcase } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ListingCard } from "@/components/ListingCard";
import { RatingStars } from "@/components/RatingStars";

export const dynamic = "force-dynamic";

/**
 * Public provider profile. Anyone (signed-in or not) can browse a provider's
 * listings, see their aggregate rating across listings, and read their most
 * recent reviews. This is the trust surface that makes the marketplace feel
 * like a marketplace.
 */
export default async function ProviderProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const provider = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      providerProfile: true,
      createdAt: true,
    },
  });
  if (!provider) notFound();

  const [listings, recentReviews, agg] = await Promise.all([
    prisma.listing.findMany({
      where: { providerId: id, status: "ACTIVE" },
      orderBy: [{ ratingAvg: "desc" }, { createdAt: "desc" }],
      take: 24,
      include: {
        provider: { select: { name: true, avatarUrl: true } },
        _count: { select: { impressions: true, requests: true } },
      },
    }),
    prisma.review.findMany({
      where: { providerId: id },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        author: { select: { name: true, avatarUrl: true } },
        listing: { select: { id: true, title: true } },
      },
    }),
    prisma.review.aggregate({
      where: { providerId: id },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  const ratingAvg = Math.round((agg._avg.rating ?? 0) * 10) / 10;
  const ratingCount = agg._count._all;
  const businessName =
    (provider.providerProfile as { businessName?: string } | null)?.businessName ??
    provider.name;

  return (
    <div className="flex flex-col gap-6">
      {/* HERO */}
      <header className="ss-card relative overflow-hidden p-6 sm:p-8">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-2xl font-semibold text-white shadow-lg shadow-indigo-500/30">
            {initials(provider.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-white">{businessName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-white/50">
              <span className="flex items-center gap-1">
                <MapPin size={11} /> {provider.name}
              </span>
              <span>· joined {new Date(provider.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <RatingStars value={ratingAvg} count={ratingCount} size={14} />
              <span className="flex items-center gap-1 text-white/60">
                <Briefcase size={12} /> {listings.length} active listing
                {listings.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* LISTINGS */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">Services</h2>
        {listings.length === 0 ? (
          <p className="text-sm text-white/50">
            No active listings right now. Check back soon!
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>

      {/* REVIEWS */}
      {recentReviews.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-white">Recent reviews</h2>
          <ul className="flex flex-col gap-3">
            {recentReviews.map((r) => (
              <li key={r.id} className="ss-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-white">{r.author.name}</div>
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <Star size={12} className="fill-amber-300 text-amber-300" />
                    <span className="font-semibold text-white">{r.rating}</span>
                    <span>· {new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Link
                  href={`/listings/${r.listing.id}`}
                  className="mt-1 inline-block text-xs text-indigo-300 hover:underline"
                >
                  on {r.listing.title}
                </Link>
                {r.body && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-white/80">
                    {r.body}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}
