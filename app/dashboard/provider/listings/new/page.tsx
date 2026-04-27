"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Sparkles, Wand2, Wrench } from "lucide-react";
import { createListingAction } from "@/app/actions/listings";
import type { ActionResult } from "@/app/actions/auth";
import type { AgentEvent } from "@/lib/agents/runner";

const CATEGORIES = [
  "Home services",
  "Beauty & wellness",
  "Tutoring",
  "Pet care",
  "Food & catering",
  "Fitness",
  "Repair & handywork",
  "Creative",
  "Tech help",
  "Events",
];

interface DraftListing {
  title: string;
  description: string;
  category: string;
  hourlyRate: number;
}

interface PriceComps {
  comps: number;
  median?: number;
  lowEnd?: number;
  highEnd?: number;
}

export default function NewListingPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    createListingAction,
    undefined,
  );

  // Controlled form state so the AI assistant can populate it.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [hourlyRate, setHourlyRate] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // AI assistant state.
  const [idea, setIdea] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [comps, setComps] = useState<PriceComps | null>(null);
  const [aiTrace, setAiTrace] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const draftAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (state?.ok) {
      const data = state.data as { id: string };
      router.push(`/listings/${data.id}`);
    }
  }, [state, router]);

  const useCurrent = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  // Best-effort autoload location for nearby comps.
  useEffect(() => {
    if (!navigator.geolocation || coords) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => undefined,
      { timeout: 5000 },
    );
    // Mount-only: we do NOT want this to re-run when `coords` later changes
    // (we'd re-prompt for location after every drag of the lat/lng inputs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftWithAI = async () => {
    if (!idea.trim() || drafting) return;
    setDrafting(true);
    setAiError(null);
    setAiTrace([]);
    setComps(null);
    const ctrl = new AbortController();
    draftAbortRef.current = ctrl;

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "provider_coach",
          message: `Draft a listing for: ${idea.trim()}`,
          lat: coords?.lat,
          lng: coords?.lng,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(await res.text().catch(() => res.statusText));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const raw = buf.slice(0, sep).trim();
          buf = buf.slice(sep + 2);
          if (!raw || raw.startsWith(":")) continue;
          const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          let evt: AgentEvent;
          try {
            evt = JSON.parse(dataLine.slice(5).trim());
          } catch {
            continue;
          }
          if (evt.type === "tool") {
            setAiTrace((t) => [...t, evt.name]);
          } else if (evt.type === "tool_result") {
            if (evt.name === "suggest_price") {
              setComps(evt.data as PriceComps);
            } else if (evt.name === "draft_listing") {
              const d = evt.data as DraftListing;
              setTitle(d.title);
              setDescription(d.description);
              if (CATEGORIES.includes(d.category)) setCategory(d.category);
              setHourlyRate(String(d.hourlyRate));
            }
          } else if (evt.type === "error") {
            setAiError(evt.error);
          }
        }
      }
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setDrafting(false);
      draftAbortRef.current = null;
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {/* AI ASSIST */}
      <section className="ss-card overflow-hidden border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/[0.06] to-indigo-500/[0.06] p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500">
            <Sparkles size={13} className="text-white" />
          </span>
          <h2 className="text-sm font-semibold text-white">Draft with AI</h2>
          <span className="ss-chip text-[10px]">Provider Coach</span>
        </div>
        <p className="mt-1 text-xs text-white/60">
          One-line your idea. The agent will check comparable rates nearby and pre-fill the form.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                draftWithAI();
              }
            }}
            placeholder="Same-day bike repair on your stoop"
            className="ss-input flex-1"
          />
          <button
            type="button"
            onClick={draftWithAI}
            disabled={drafting || !idea.trim()}
            className="ss-btn-primary"
          >
            {drafting ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            Generate
          </button>
        </div>
        {(aiTrace.length > 0 || comps) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
            {aiTrace.map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-indigo-200"
              >
                <Wrench size={10} />
                <span className="font-mono">{name}</span>
              </span>
            ))}
            {comps && comps.median != null && (
              <span className="text-white/60">
                {comps.comps} comps · median ${comps.median}/hr
                {comps.lowEnd != null && comps.highEnd != null && (
                  <> · range ${comps.lowEnd}–${comps.highEnd}</>
                )}
              </span>
            )}
            {comps && comps.median == null && (
              <span className="text-white/60">No comps yet — first in this category!</span>
            )}
          </div>
        )}
        {aiError && (
          <p className="mt-2 text-xs text-rose-300">
            {aiError}
            <span className="ml-1 text-white/40">— you can still fill the form below by hand.</span>
          </p>
        )}
      </section>

      {/* FORM */}
      <div className="ss-card p-8">
        <h1 className="text-2xl font-semibold text-white">Create a listing</h1>
        <p className="mt-1 text-sm text-white/60">
          It will appear on the Vibe map for neighbors in your hex cell.
        </p>

        <form action={action} className="mt-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="ss-label" htmlFor="title">Title</label>
            <input
              id="title"
              name="title"
              required
              className="ss-input"
              placeholder="Same-day bike repair"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="ss-label" htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              required
              rows={4}
              className="ss-input resize-none"
              minLength={20}
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="ss-label" htmlFor="category">Category</label>
            <select
              id="category"
              name="category"
              required
              className="ss-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ss-label" htmlFor="hourlyRate">Hourly rate (USD)</label>
            <input
              id="hourlyRate"
              name="hourlyRate"
              type="number"
              min={1}
              max={10000}
              step="0.01"
              required
              className="ss-input"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />
          </div>
          <div>
            <label className="ss-label" htmlFor="lat">Latitude</label>
            <input
              id="lat"
              name="lat"
              type="number"
              step="any"
              required
              className="ss-input"
              value={coords?.lat ?? ""}
              onChange={(e) =>
                setCoords((c) => ({ lat: Number(e.target.value), lng: c?.lng ?? 0 }))
              }
            />
          </div>
          <div>
            <label className="ss-label" htmlFor="lng">Longitude</label>
            <input
              id="lng"
              name="lng"
              type="number"
              step="any"
              required
              className="ss-input"
              value={coords?.lng ?? ""}
              onChange={(e) =>
                setCoords((c) => ({ lat: c?.lat ?? 0, lng: Number(e.target.value) }))
              }
            />
          </div>
          <div className="col-span-2">
            <button type="button" onClick={useCurrent} className="ss-btn-ghost text-xs">
              <MapPin size={12} /> Use my current location
            </button>
          </div>

          {state && !state.ok && <p className="col-span-2 text-sm text-rose-300">{state.error}</p>}

          <div className="col-span-2 flex justify-end">
            <button type="submit" disabled={pending} className="ss-btn-primary">
              {pending && <Loader2 size={14} className="animate-spin" />}
              Publish listing
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
