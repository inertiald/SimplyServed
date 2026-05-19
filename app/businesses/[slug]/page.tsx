import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MapPin, Globe, Phone, Mail, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function BusinessProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await prisma.businessProfile.findUnique({
    where: { slug },
    include: {
      sources: { select: { source: true, sourceUrl: true } },
      media: { take: 6, orderBy: { createdAt: "desc" } },
    },
  });
  if (!profile || profile.tombstonedAt) notFound();

  // If this profile has been claimed and converted, redirect to the live Listing.
  if (profile.claimStatus === "CLAIMED" && profile.claimedListingId) {
    redirect(`/listings/${profile.claimedListingId}`);
  }

  const user = await getSessionUser();
  const uniqueSources = [...new Set(profile.sources.map((s) => s.source))];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <article className="ss-card p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {profile.category && <span className="ss-chip">{profile.category}</span>}
              <span className="ss-chip">Unverified</span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-white">{profile.name}</h1>
            {profile.address && (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
                <MapPin size={14} />{" "}
                {[profile.address, profile.city, profile.region, profile.postalCode]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            )}
          </div>
        </div>

        {profile.description && (
          <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
            {profile.description}
          </p>
        )}

        <div className="mt-6 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
          {profile.phone && (
            <span className="flex items-center gap-2"><Phone size={14} /> {profile.phone}</span>
          )}
          {profile.email && (
            <span className="flex items-center gap-2"><Mail size={14} /> {profile.email}</span>
          )}
          {profile.website && (
            <a
              href={profile.website}
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="flex items-center gap-2 text-indigo-300 hover:underline"
            >
              <Globe size={14} /> {profile.website}
            </a>
          )}
        </div>

        {profile.media.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {profile.media.map((m) =>
              m.kind === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={m.id}
                  src={m.url}
                  alt={m.caption ?? profile.name}
                  className="aspect-video w-full rounded-lg object-cover"
                />
              ) : (
                <video
                  key={m.id}
                  src={m.url}
                  controls
                  className="aspect-video w-full rounded-lg bg-black"
                />
              ),
            )}
          </div>
        )}

        <div className="mt-8 border-t border-white/5 pt-5 text-xs text-white/50">
          Aggregated from:{" "}
          {uniqueSources.map((s, i) => (
            <span key={s}>
              {i > 0 && ", "}
              <span className="text-white/70">{s}</span>
            </span>
          ))}
          . SimplyServed scrapers respect robots.txt and rate-limit politely.
        </div>
      </article>

      <aside className="ss-card flex flex-col gap-3 p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <ShieldCheck size={16} /> Claim this listing
        </h2>
        <p className="text-xs text-white/60">
          If you own or manage {profile.name}, claim it to update photos, hours,
          pricing, and start accepting bookings.
        </p>
        {!user ? (
          <Link href={`/sign-in?next=/businesses/${profile.slug}/claim`} className="ss-btn-primary">
            Sign in to claim
          </Link>
        ) : profile.claimStatus === "PENDING" ? (
          <p className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 p-3 text-xs text-yellow-200">
            A claim is already pending review.
          </p>
        ) : (
          <Link href={`/businesses/${profile.slug}/claim`} className="ss-btn-primary">
            Claim this listing
          </Link>
        )}

        <Link
          href={`/businesses/${profile.slug}/takedown`}
          className="text-center text-[11px] text-white/40 underline-offset-4 hover:underline"
        >
          Request removal
        </Link>
      </aside>
    </div>
  );
}
