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
            <Link href="/concierge" className="ss-btn-primary">
              <Sparkles size={14} /> Try the AI concierge
            </Link>
            <Link href="/sign-up" className="ss-btn-ghost">
              Join the neighborhood <ArrowRight size={14} />
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

      {/* AI CONCIERGE TEASER */}
      <section className="ss-card relative grid gap-6 overflow-hidden border-fuchsia-500/20 bg-gradient-to-br from-indigo-500/10 via-transparent to-fuchsia-500/10 p-8 sm:grid-cols-[1fr_1.1fr] sm:items-center">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="relative">
          <span className="ss-chip mb-3">
            <Sparkles size={12} className="text-fuchsia-300" />
            New · Local AI agents
          </span>
          <h2 className="text-2xl font-semibold leading-tight text-white sm:text-3xl">
            Tell our concierge what you need.
            <br />
            <span className="bg-gradient-to-br from-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
              Skip the search.
            </span>
          </h2>
          <p className="mt-3 max-w-md text-sm text-white/60">
            A llama-3.2 agent runs on your own machine, calls tools to search the
            block, and drafts a request you can place in one click. Providers get
            their own coach for pricing and listings.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/concierge" className="ss-btn-primary">
              Open the concierge <ArrowRight size={14} />
            </Link>
            <Link href="/vibe" className="ss-btn-ghost">
              See the live pulse
            </Link>
          </div>
        </div>
        <div className="relative">
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur">
            <div className="flex items-center gap-2 border-b border-white/5 pb-3 text-[11px] text-white/50">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500">
                <Sparkles size={10} className="text-white" />
              </span>
              Concierge · llama 3.2 · local
            </div>
            <div className="space-y-2 pt-3 text-sm">
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 px-3 py-1.5 text-xs text-white">
                  Need a dog walker on Saturday morning, under $30
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-200">
                  search_listings · 3 nearby
                </span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-200">
                  draft_request · quote $32.25
                </span>
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/90">
                Found 3 walkers within two hex cells. Diego is $25/hr and free Saturday — want me to draft the request?
              </div>
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
