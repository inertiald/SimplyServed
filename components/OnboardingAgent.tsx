"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Loader2, MapPin, Sparkles, Wifi, WifiOff } from "lucide-react";
import {
  MAX_HISTORY_LENGTH,
  type OnboardingServerMessage,
  type OnboardingStepEvent,
} from "@/lib/agents/onboarding_protocol";

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "streaming" | "done" | "error";
  steps?: OnboardingStepEvent[];
  error?: string;
}

const SUGGESTIONS = [
  "I run a mobile bike-repair service in Oakland. Help me onboard.",
  "Guide me through claiming my bakery profile and creating my first listing.",
  "I do in-home tutoring. What should my first listing look like?",
];
const MAX_RECONNECT_DELAY_MS = 8_000;

export function OnboardingAgent({
  signedIn,
  wsUrl,
}: {
  signedIn: boolean;
  wsUrl?: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [wsOnline, setWsOnline] = useState(false);
  const [wsUnavailable, setWsUnavailable] = useState(false);
  const [coords, setCoords] = useState({ lat: 37.7749, lng: -122.4194 });
  const [geoLabel, setGeoLabel] = useState("San Francisco (default)");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAssistantTurnRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const resolvedWsUrl = useMemo(() => {
    if (wsUrl) return wsUrl;
    if (typeof window === "undefined") return "";
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.hostname}:3001/api/agent/onboarding/ws`;
  }, [wsUrl]);

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

  const apply = useCallback((evt: OnboardingServerMessage) => {
    const id = activeAssistantTurnRef.current;
    if (!id) return;

    if (evt.type === "token") {
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, text: t.text + evt.text } : t)),
      );
      return;
    }
    if (evt.type === "step") {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, steps: [...(t.steps ?? []), evt.event] } : t,
        ),
      );
      return;
    }
    if (evt.type === "done") {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, text: evt.content || t.text, status: "done" } : t,
        ),
      );
      setBusy(false);
      activeAssistantTurnRef.current = null;
      return;
    }
    if (evt.type === "error") {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: "error", error: evt.error } : t,
        ),
      );
      setBusy(false);
      activeAssistantTurnRef.current = null;
      if (evt.code === "UNAUTHORIZED") setWsUnavailable(true);
      return;
    }
  }, []);

  const connect = useCallback(() => {
    if (!signedIn || !resolvedWsUrl || wsRef.current) return;
    try {
      const ws = new WebSocket(resolvedWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsOnline(true);
        reconnectRef.current = 0;
        setWsUnavailable(false);
      };

      ws.onmessage = (event) => {
        let msg: OnboardingServerMessage;
        try {
          msg = JSON.parse(event.data) as OnboardingServerMessage;
        } catch {
          return;
        }
        if (msg.type === "ready") return;
        apply(msg);
      };

      ws.onerror = () => {
        setWsOnline(false);
      };

      ws.onclose = () => {
        wsRef.current = null;
        setWsOnline(false);
        if (!mountedRef.current) return;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        const attempt = Math.min(reconnectRef.current + 1, 5);
        reconnectRef.current = attempt;
        const delay = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** attempt);
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    } catch {
      setWsUnavailable(true);
      setWsOnline(false);
      console.warn("Onboarding WebSocket connection failed");
    }
  }, [apply, resolvedWsUrl, signedIn]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      abortRef.current?.abort();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const sendFallback = useCallback(
    async (text: string) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const history = turns
          .filter((t) => t.status === "done" && t.text)
          .slice(-MAX_HISTORY_LENGTH)
          .map((t) => ({ role: t.role, content: t.text }));
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: "onboarding",
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
          let sep: number;
          while ((sep = buf.indexOf("\n\n")) !== -1) {
            const raw = buf.slice(0, sep).trim();
            buf = buf.slice(sep + 2);
            if (!raw || raw.startsWith(":")) continue;
            const data = raw
              .split("\n")
              .find((line) => line.startsWith("data:"))
              ?.slice(5)
              .trim();
            if (!data) continue;
            try {
              const evt = JSON.parse(data) as
                | { type: "token"; text: string }
                | { type: "done"; content: string }
                | OnboardingStepEvent
                | { type: "error"; error: string };
              if (evt.type === "token") apply(evt);
              else if (evt.type === "done") apply(evt);
              else if (evt.type === "error") apply(evt);
              else apply({ type: "step", event: evt });
            } catch {
              continue;
            }
          }
        }
      } catch (err) {
        apply({
          type: "error",
          error: (err as Error).message || "Onboarding request failed.",
        });
      } finally {
        abortRef.current = null;
      }
    },
    [apply, coords.lat, coords.lng, turns],
  );

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      setBusy(true);

      const userTurn: Turn = {
        id: crypto.randomUUID(),
        role: "user",
        text,
        status: "done",
      };
      const assistantId = crypto.randomUUID();
      const assistantTurn: Turn = {
        id: assistantId,
        role: "assistant",
        text: "",
        status: "streaming",
        steps: [],
      };
      activeAssistantTurnRef.current = assistantId;
      setTurns((prev) => [...prev, userTurn, assistantTurn]);
      setInput("");

      const history = turns
        .filter((t) => t.status === "done" && t.text)
        .slice(-MAX_HISTORY_LENGTH)
        .map((t) => ({ role: t.role, content: t.text }));

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && !wsUnavailable) {
        ws.send(
          JSON.stringify({
            type: "user_turn",
            agent: "onboarding",
            message: text,
            history,
            lat: coords.lat,
            lng: coords.lng,
          }),
        );
        return;
      }

      setWsUnavailable(true);
      await sendFallback(text);
    },
    [busy, coords.lat, coords.lng, sendFallback, turns, wsUnavailable],
  );

  if (!signedIn) {
    return (
      <div className="ss-card p-5 text-sm text-white/70">
        Sign in to use the onboarding agent.
      </div>
    );
  }

  return (
    <div className="ss-card flex h-[78vh] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-white">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500">
            <Sparkles size={13} className="text-white" />
          </span>
          <span className="font-semibold">Provider Onboarding</span>
          <span className="ss-chip text-[10px]">llama 3.2 · local</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="inline-flex items-center gap-1">
            {wsOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            {wsOnline ? "Live WS" : "Fallback mode"}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin size={11} /> {geoLabel}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-white/70">
              I can guide business basics, category, location, claim verification, and your
              first listing draft.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="ss-card p-3 text-left text-sm text-white/80 transition hover:bg-white/[0.05]"
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id} className={t.role === "user" ? "flex justify-end" : "flex flex-col gap-2"}>
            {t.steps && t.steps.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {t.steps.map((s, i) => (
                  <span
                    key={`${s.type}-${i}`}
                    className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-200"
                  >
                    {s.type === "tool" ? s.name : s.type === "tool_result" ? s.summary : s.type}
                  </span>
                ))}
              </div>
            )}
            <div
              className={
                t.role === "user"
                  ? "max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm text-white"
                  : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90"
              }
            >
              {t.text}
              {t.status === "streaming" && (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-white/60" />
              )}
            </div>
            {t.status === "error" && (
              <p className="text-xs text-rose-300">{t.error ?? "Something went wrong."}</p>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-end gap-2 border-t border-white/5 bg-black/30 p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          placeholder="Describe your business and what you want to set up first..."
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
    </div>
  );
}
