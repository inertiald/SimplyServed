import Link from "next/link";
import { ArrowRight, MapPinned, Sparkles, Tag, ShieldCheck, Workflow } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ListingCard } from "@/components/ListingCard";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  // Show a few real listings on the landing if seed data exists.
  const featured = await prisma.listing
    .findMany({
      where: { status: "ACTIVE" },
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        provider: { select: { name: true, avatarUrl: true } },
        _count: { select: { impressions: true, requests: true } },
      },
    })
    .catch(() => []);

  return (
    <div className="flex flex-col gap-24">
      {/* HERO */}
      <section className="grid items-center gap-10 pt-10 lg:grid-cols-2 lg:pt-20">
        <div>
          <span className="ss-chip mb-5">
            <Sparkles size={12} className="text-fuchsia-300" />
            Hyper-local services & community vibe
          </span>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-6xl">
            Your block.
            <br />
            <span className="bg-gradient-to-br from-indigo-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent">
              On demand.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/60">
            Discover trusted neighborhood services, share what&apos;s actually happening
            outside your window, and clip live offers from local businesses — all in one
            beautifully native app.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/sign-up" className="ss-btn-primary">
              Join the neighborhood <ArrowRight size={14} />
            </Link>
            <Link href="/vibe" className="ss-btn-ghost">
              Explore the vibe map
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4 text-xs text-white/60">
            <Stat n="H3 res-9" label="hex precision" />
            <Stat n="< 100ms" label="discover query" />
            <Stat n="Real-time" label="post pub/sub" />
          </div>
        </div>

        {/* Decorative panel */}
        <div className="ss-card relative h-[440px] overflow-hidden p-1">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.4),transparent_55%),radial-gradient(circle_at_75%_75%,rgba(236,72,153,0.35),transparent_50%)]" />
          <div className="relative h-full w-full overflow-hidden rounded-[14px] border border-white/10 bg-black/40 p-6 backdrop-blur">
            <div className="flex items-center gap-2 text-xs text-white/60">
              <MapPinned size={12} /> live · 0.3 mi radius
            </div>
            <div className="mt-4 space-y-3">
              {[
                { who: "Ana", what: "Espresso bar opening at 7am, first 20 cups free!", chip: "OFFER", color: "fuchsia" },
                { who: "Diego", what: "Neighborhood cleanup at the park Saturday — bring gloves.", chip: "GENERAL", color: "sky" },
                { who: "Studio Rho", what: "Tonight only: $40 vinyl drop-in classes.", chip: "BUSINESS", color: "amber" },
              ].map((x, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white">
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/40">
                    <span>{x.who}</span>
                    <span className={`text-${x.color}-300`}>{x.chip}</span>
                  </div>
                  {x.what}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: MapPinned,
            title: "H3 hex discovery",
            body: "Listings and posts indexed at neighborhood resolution — surfaced via cached, cursor-paginated route handlers.",
          },
          {
            icon: Workflow,
            title: "Service request state machine",
            body: "PLACED → DELIVERED → COMPLETED. Strict role-based transitions enforced inside typed Server Actions.",
          },
          {
            icon: ShieldCheck,
            title: "Privacy-preserving signals",
            body: "Reactions are HMAC-bucketed by hour so we get hot-spot data without storing user → listing edges.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="ss-card p-5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 text-indigo-200">
              <Icon size={16} />
            </span>
            <h3 className="mt-4 font-semibold text-white">{title}</h3>
            <p className="mt-1 text-sm text-white/60">{body}</p>
          </div>
        ))}
      </section>

      {/* FEATURED */}
      {featured.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-2xl font-semibold text-white">Fresh on the block</h2>
            <Link href="/listings" className="text-sm text-indigo-300 hover:text-indigo-200">
              Browse all →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}

      {/* OFFERS CTA */}
      <section className="ss-card grid gap-4 p-8 sm:grid-cols-2 sm:items-center">
        <div>
          <span className="ss-chip mb-3">
            <Tag size={12} className="text-fuchsia-300" />
            For local businesses
          </span>
          <h2 className="text-2xl font-semibold text-white">Drop a coupon. Watch your block fill up.</h2>
          <p className="mt-2 text-sm text-white/60">
            Publish a live offer in seconds. Anyone in the surrounding hex cells gets it
            pushed to their feed in real time. Built-in expiration, copy-to-clipboard
            redemption, and impression analytics.
          </p>
        </div>
        <div className="flex justify-end">
          <Link href="/sign-up" className="ss-btn-primary">
            Claim your storefront <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div className="text-base font-semibold text-white">{n}</div>
      <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}
