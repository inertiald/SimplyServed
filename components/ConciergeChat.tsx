"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  Loader2,
  MapPin,
  Sparkles,
  Wand2,
  Wrench,
  Zap,
} from "lucide-react";
import type { AgentEvent } from "@/lib/agents/runner";

interface ListingHit {
  id: string;
  title: string;
  category: string;
  hourlyRate: number;
  provider: string;
  description: string;
}

interface Quote {
  base: number;
  platformFee: number;
  total: number;
}

interface DraftRequest {
  listingId: string;
  title: string;
  hours: number;
  notes: string;
  quote: Quote;
  bookingUrl: string;
}

interface ToolBubble {
  name: string;
  args: Record<string, unknown>;
  status: "running" | "ok" | "error";
  summary?: string;
  error?: string;
}

interface AgentTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools?: ToolBubble[];
  /** Hits surfaced from `search_listings` / `get_listing`. */
  listings?: ListingHit[];
  /** Drafts surfaced from `draft_request`. */
  draft?: DraftRequest;
  status: "streaming" | "done" | "error";
  error?: string;
}

const SUGGESTIONS = [
  "I need someone to walk my dog Saturday morning",
  "Find me a same-day bike repair under $80",
  "What food pop-ups are happening this weekend?",
  "I want a 1-hour tutoring session for algebra",
];

export function ConciergeChat({
  agent,
  initialPrompt,
  signedIn,
}: {
  agent: "concierge" | "provider_coach";
  initialPrompt?: string;
  signedIn: boolean;
}) {
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState({ lat: 37.7749, lng: -122.4194 });
  const [geoLabel, setGeoLabel] = useState<string>("San Francisco (default)");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Geolocate on mount, best-effort.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeoLabel("your location");
      },
      () => undefined,
      { timeout: 5000 },
    );
  }, []);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      setBusy(true);

      const userTurn: AgentTurn = {
        id: crypto.randomUUID(),
        role: "user",
        text,
        status: "done",
      };
      const asstId = crypto.randomUUID();
      const asstTurn: AgentTurn = {
        id: asstId,
        role: "assistant",
        text: "",
        tools: [],
        listings: [],
        status: "streaming",
      };
      setTurns((prev) => [...prev, userTurn, asstTurn]);
      setInput("");

      // Build short history for the API: last few user/assistant text pairs.
      const history = turns
        .filter((t) => t.status === "done" && t.text)
        .slice(-6)
        .map((t) => ({ role: t.role, content: t.text }));

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent,
            message: text,
            history,
            lat: coords.lat,
            lng: coords.lng,
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

          // Parse complete SSE events from buffer.
          let sep: number;
          while ((sep = buf.indexOf("\n\n")) !== -1) {
            const raw = buf.slice(0, sep).trim();
            buf = buf.slice(sep + 2);
            if (!raw || raw.startsWith(":")) continue;
            const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const json = dataLine.slice(5).trim();
            let evt: AgentEvent;
            try {
              evt = JSON.parse(json);
            } catch {
              continue;
            }
            applyEvent(asstId, evt, setTurns);
          }
        }
        setTurns((prev) =>
          prev.map((t) =>
            t.id === asstId && t.status === "streaming"
              ? { ...t, status: "done" }
              : t,
          ),
        );
      } catch (err) {
        const msg = (err as Error).message || "Request failed";
        setTurns((prev) =>
          prev.map((t) =>
            t.id === asstId
              ? { ...t, status: "error", error: msg }
              : t,
          ),
        );
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [agent, busy, coords.lat, coords.lng, turns],
  );

  // Auto-send if the page passed an initialPrompt.
  const initialSent = useRef(false);
  useEffect(() => {
    if (!initialSent.current && initialPrompt && !busy) {
      initialSent.current = true;
      send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  return (
    <div className="ss-card flex h-[78vh] flex-col overflow-hidden">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-white">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500">
            <Sparkles size={13} className="text-white" />
          </span>
          <span className="font-semibold">
            {agent === "concierge" ? "Concierge" : "Provider Coach"}
          </span>
          <span className="ss-chip text-[10px]">llama 3.2 · local</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/50">
          <MapPin size={11} /> {geoLabel}
        </div>
      </div>

      {/* MESSAGES */}
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
        {turns.length === 0 && <EmptyHero agent={agent} onPick={send} />}
        {turns.map((t) =>
          t.role === "user" ? (
            <UserBubble key={t.id} text={t.text} />
          ) : (
            <AssistantBubble key={t.id} turn={t} />
          ),
        )}
        {busy && turns[turns.length - 1]?.status === "streaming" && (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Loader2 size={12} className="animate-spin" /> thinking…
          </div>
        )}
      </div>

      {/* INPUT */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-white/5 bg-black/30 p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={
            agent === "concierge"
              ? "What do you need done in your neighborhood?"
              : "What service should we package today?"
          }
          className="ss-input min-h-[44px] flex-1 resize-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="ss-btn-primary h-11 w-11 justify-center !px-0"
          aria-label="Send"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
        </button>
      </form>

      {!signedIn && agent === "concierge" && (
        <div className="border-t border-white/5 bg-indigo-500/5 px-5 py-2 text-center text-xs text-white/60">
          You can chat without an account.{" "}
          <Link href="/sign-up" className="text-indigo-300 hover:text-indigo-200">
            Sign up
          </Link>{" "}
          to actually book what we recommend.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event reducer
// ---------------------------------------------------------------------------
function applyEvent(
  id: string,
  evt: AgentEvent,
  setTurns: React.Dispatch<React.SetStateAction<AgentTurn[]>>,
) {
  setTurns((prev) =>
    prev.map((t) => {
      if (t.id !== id) return t;
      const tools = t.tools ? [...t.tools] : [];
      switch (evt.type) {
        case "thought":
          return { ...t, text: t.text ? t.text + "\n" + evt.text : evt.text };
        case "tool":
          tools.push({ name: evt.name, args: evt.args, status: "running" });
          return { ...t, tools };
        case "tool_result": {
          const idx = tools.map((b) => b.status).lastIndexOf("running");
          if (idx >= 0) {
            tools[idx] = {
              ...tools[idx],
              status: "ok",
              summary: evt.summary,
            };
          }
          // Lift listing data into the turn so we can render cards.
          let listings = t.listings ?? [];
          let draft = t.draft;
          if (evt.name === "search_listings" && Array.isArray(evt.data)) {
            listings = [...listings, ...(evt.data as ListingHit[])];
          } else if (evt.name === "get_listing" && evt.data) {
            const d = evt.data as ListingHit & { error?: string };
            if (!d.error) listings = [...listings, d];
          } else if (evt.name === "draft_request" && evt.data) {
            const d = evt.data as DraftRequest & { error?: string };
            if (!d.error) draft = d;
          }
          return { ...t, tools, listings, draft };
        }
        case "tool_error": {
          const idx = tools.map((b) => b.status).lastIndexOf("running");
          if (idx >= 0) {
            tools[idx] = {
              ...tools[idx],
              status: "error",
              error: evt.error,
            };
          }
          return { ...t, tools };
        }
        case "token":
          return { ...t, text: t.text + evt.text };
        case "done":
          return { ...t, text: evt.content || t.text, status: "done" };
        case "error":
          return { ...t, status: "error", error: evt.error };
        default:
          return t;
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm text-white shadow-lg shadow-indigo-500/20">
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({ turn }: { turn: AgentTurn }) {
  return (
    <div className="flex flex-col gap-2">
      {turn.tools && turn.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {turn.tools.map((b, i) => (
            <ToolChip key={i} bubble={b} />
          ))}
        </div>
      )}
      {turn.text && (
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90">
          {turn.text}
          {turn.status === "streaming" && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-white/60" />
          )}
        </div>
      )}
      {turn.listings && turn.listings.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {dedupe(turn.listings).map((l) => (
            <ListingHitCard key={l.id} listing={l} />
          ))}
        </div>
      )}
      {turn.draft && <DraftCard draft={turn.draft} />}
      {turn.status === "error" && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {turn.error ?? "Something went wrong."}
        </div>
      )}
    </div>
  );
}

function ToolChip({ bubble }: { bubble: ToolBubble }) {
  const Icon = bubble.status === "running" ? Loader2 : bubble.status === "ok" ? Zap : Wrench;
  const tone =
    bubble.status === "error"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
      : bubble.status === "ok"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        : "border-indigo-500/30 bg-indigo-500/10 text-indigo-200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] ${tone}`}
      title={JSON.stringify(bubble.args)}
    >
      <Icon
        size={11}
        className={bubble.status === "running" ? "animate-spin" : ""}
      />
      <span className="font-mono">{bubble.name}</span>
      {bubble.summary && <span className="opacity-70">· {bubble.summary}</span>}
      {bubble.error && <span className="opacity-70">· {bubble.error}</span>}
    </span>
  );
}

function ListingHitCard({ listing }: { listing: ListingHit }) {
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="ss-card group flex flex-col gap-2 p-3 transition hover:-translate-y-0.5 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="ss-chip text-[10px]">{listing.category}</span>
        <span className="text-sm font-semibold text-white">
          ${listing.hourlyRate}
          <span className="text-[10px] text-white/50">/hr</span>
        </span>
      </div>
      <div className="text-sm font-semibold leading-tight text-white group-hover:text-indigo-300">
        {listing.title}
      </div>
      <div className="text-[11px] text-white/50">by {listing.provider}</div>
      <p className="line-clamp-2 text-[11px] text-white/60">{listing.description}</p>
    </Link>
  );
}

function DraftCard({ draft }: { draft: DraftRequest }) {
  return (
    <div className="ss-card border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 to-indigo-500/10 p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-fuchsia-200/80">
        <Wand2 size={11} /> Draft request
      </div>
      <div className="mt-1 text-sm font-semibold text-white">{draft.title}</div>
      {draft.notes && (
        <p className="mt-1 text-xs text-white/70">“{draft.notes}”</p>
      )}
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-white/60">
          {draft.hours} hr · ${draft.quote.base.toFixed(2)} + ${draft.quote.platformFee.toFixed(2)} fee
        </span>
        <span className="text-base font-semibold text-white">
          ${draft.quote.total.toFixed(2)}
        </span>
      </div>
      <Link
        href={draft.bookingUrl}
        className="ss-btn-primary mt-3 w-full justify-center text-xs"
      >
        Open booking form →
      </Link>
    </div>
  );
}

function EmptyHero({
  agent,
  onPick,
}: {
  agent: "concierge" | "provider_coach";
  onPick: (s: string) => void;
}) {
  const prompts =
    agent === "concierge"
      ? SUGGESTIONS
      : [
          "Help me write a listing for weekend pet sitting",
          "Draft a 20% off coupon for my cold-brew bar",
          "What should I charge for a 1-hour tutoring session?",
          "Write a punchy listing for same-day bike repair",
        ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-xl shadow-indigo-500/30">
        <Sparkles size={22} className="text-white" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-white">
          {agent === "concierge"
            ? "Tell me what you need."
            : "Let's package what you do."}
        </h2>
        <p className="mt-1 text-sm text-white/60">
          {agent === "concierge"
            ? "I'll search your neighborhood and draft a request you can place in one click."
            : "I'll comp your prices, draft your listing, and write your offers."}
        </p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {prompts.map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            className="ss-card p-3 text-left text-sm text-white/80 transition hover:-translate-y-0.5 hover:bg-white/[0.05]"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function dedupe(arr: ListingHit[]): ListingHit[] {
  const seen = new Set<string>();
  const out: ListingHit[] = [];
  for (const l of arr) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(l);
  }
  return out;
}
