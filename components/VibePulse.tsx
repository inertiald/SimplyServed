"use client";

import { useEffect, useState } from "react";
import { Loader2, Radio, Sparkles } from "lucide-react";

interface PulseData {
  summary: string;
  counts: {
    posts24h: number;
    activeListings: number;
    offers: number;
    businesses: number;
  };
  ollama: boolean;
}

/**
 * Pinned card at the top of the Vibe page that asks the local LLM to write a
 * 1-sentence briefing about what's happening in the user's hex ring. Pure
 * client-side fetch so the rest of the page renders instantly.
 */
export function VibePulse() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [data, setData] = useState<PulseData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve coords from geolocation (fall back to SF).
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords({ lat: 37.7749, lng: -122.4194 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setCoords({ lat: 37.7749, lng: -122.4194 }),
      { timeout: 4000 },
    );
  }, []);

  useEffect(() => {
    if (!coords) return;
    let aborted = false;
    setError(null);
    fetch(`/api/agent/pulse?lat=${coords.lat}&lng=${coords.lng}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text().catch(() => r.statusText));
        return (await r.json()) as PulseData;
      })
      .then((d) => !aborted && setData(d))
      .catch((e) => !aborted && setError((e as Error).message));
    return () => {
      aborted = true;
    };
  }, [coords]);

  return (
    <div className="ss-card relative overflow-hidden border-fuchsia-500/20 bg-gradient-to-br from-indigo-500/[0.07] via-transparent to-fuchsia-500/[0.07] p-5">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg shadow-indigo-500/20">
          <Sparkles size={15} className="text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/50">
            <Radio size={10} className="animate-pulse text-fuchsia-300" />
            <span>Neighborhood Pulse</span>
            {data && !data.ollama && <span className="text-white/30">· offline summary</span>}
          </div>
          {!data && !error ? (
            <div className="mt-1 flex items-center gap-2 text-sm text-white/40">
              <Loader2 size={12} className="animate-spin" />
              Reading the room…
            </div>
          ) : error ? (
            <p className="mt-1 text-sm text-white/60">
              Couldn&apos;t generate a summary right now.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm leading-relaxed text-white/90">
                {data!.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <Pill label={`${data!.counts.posts24h} posts · 24h`} />
                <Pill label={`${data!.counts.activeListings} listings`} />
                {data!.counts.offers > 0 && (
                  <Pill label={`${data!.counts.offers} live offers`} tone="fuchsia" />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({
  label,
  tone = "indigo",
}: {
  label: string;
  tone?: "indigo" | "fuchsia";
}) {
  const cls =
    tone === "fuchsia"
      ? "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200"
      : "border-white/10 bg-white/5 text-white/70";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}
