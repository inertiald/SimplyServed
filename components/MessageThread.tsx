"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import {
  loadThreadAction,
  sendMessageAction,
} from "@/app/actions/messages";
import type { ActionResult } from "@/app/actions/auth";

interface ThreadMessage {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  isMine: boolean;
}

/**
 * Collapsible message thread for a service request. Both the consumer and the
 * provider see the same thing; "isMine" is computed server-side so each user's
 * outgoing messages appear right-aligned.
 *
 * Live updates: we listen for window-level "ss:notify" events dispatched by
 * the global NotificationsBell when it sees a `kind:"message"` payload for
 * this request.
 */
export function MessageThread({
  requestId,
  initialCount = 0,
}: {
  requestId: string;
  initialCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [body, setBody] = useState("");
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    sendMessageAction,
    undefined,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load thread when opened (or when a live message arrives while open).
  const refresh = async () => {
    setLoading(true);
    const res = await loadThreadAction(requestId);
    setLoading(false);
    if (res.ok) {
      const list = res.data as ThreadMessage[];
      setMessages(list);
      setCount(list.length);
    }
  };

  useEffect(() => {
    if (open && messages.length === 0 && !loading) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Append optimistically and refresh after the server action finishes.
  useEffect(() => {
    if (state?.ok) {
      const m = state.data as {
        id: string;
        authorId: string;
        body: string;
        createdAt: string;
      };
      setMessages((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        return [
          ...prev,
          {
            id: m.id,
            authorId: m.authorId,
            authorName: "You",
            body: m.body,
            createdAt: m.createdAt,
            isMine: true,
          },
        ];
      });
      setCount((c) => c + 1);
      setBody("");
    }
  }, [state]);

  // Subscribe to global notification bus for this request id.
  useEffect(() => {
    const onNotify = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { kind: string; requestId?: string }
        | undefined;
      if (!detail || detail.kind !== "message" || detail.requestId !== requestId) return;
      if (open) refresh();
      else setCount((c) => c + 1);
    };
    window.addEventListener("ss:notify", onNotify);
    return () => window.removeEventListener("ss:notify", onNotify);
    // `messages` / `loading` are intentionally excluded — adding them would
    // re-subscribe on every refetch, churning the listener. We only care
    // whether the panel is open and which request id we're scoped to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestId]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, open]);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ss-btn-ghost text-xs"
      >
        <MessageSquare size={12} />
        Messages
        {count > 0 && (
          <span className="ml-1 rounded-full bg-indigo-500/30 px-1.5 text-[10px] text-indigo-100">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
          <div
            ref={scrollRef}
            className="max-h-64 overflow-y-auto pr-1"
          >
            {loading && messages.length === 0 ? (
              <div className="flex justify-center py-4 text-xs text-white/40">
                <Loader2 size={12} className="animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <p className="py-3 text-center text-xs text-white/40">
                No messages yet — say hi!
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`flex ${m.isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs ${
                        m.isMine
                          ? "rounded-br-sm bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"
                          : "rounded-bl-sm border border-white/10 bg-white/5 text-white/90"
                      }`}
                    >
                      {!m.isMine && (
                        <div className="mb-0.5 text-[10px] uppercase tracking-wider text-white/50">
                          {m.authorName}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{m.body}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form action={action} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="requestId" value={requestId} />
            <input
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a message…"
              required
              maxLength={2000}
              className="ss-input flex-1"
            />
            <button
              type="submit"
              disabled={pending || !body.trim()}
              className="ss-btn-primary !px-3"
              aria-label="Send"
            >
              {pending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Send size={12} />
              )}
            </button>
          </form>
          {state && !state.ok && (
            <p className="mt-1 text-xs text-rose-300">{state.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
