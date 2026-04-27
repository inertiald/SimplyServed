"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";

interface Notification {
  id: string;
  kind: string;
  preview: string;
  from?: string;
  href?: string;
  at: string;
  read: boolean;
}

/**
 * Live notifications bell.
 *
 * Subscribes to the existing `/api/realtime` SSE which already publishes the
 * signed-in user's `notify:user:<id>` channel. As payloads arrive we:
 *
 *   1. Push them onto a small in-memory list.
 *   2. Re-broadcast them on a `window` event (`ss:notify`) so other components
 *      on the page (like MessageThread) can react without each opening their
 *      own EventSource.
 *
 * Storage is intentionally ephemeral — refreshing the page resets the bell.
 * For the MVP that's the expected behavior; a persistent inbox would graduate
 * to its own table.
 */
export function NotificationsBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource("/api/realtime");
    es.addEventListener("message", (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data) as {
          channel: string;
          payload: Record<string, unknown>;
        };
        if (!parsed.channel?.startsWith("notify:")) return;
        const p = parsed.payload ?? {};
        const note: Notification = {
          id: crypto.randomUUID(),
          kind: String(p.kind ?? p.type ?? "event"),
          preview: String(
            p.preview ??
              p.message ??
              (p.status ? `Status changed to ${p.status}` : "New notification"),
          ),
          from: typeof p.from === "string" ? p.from : undefined,
          href: hrefFor(p),
          at: String(p.at ?? new Date().toISOString()),
          read: false,
        };
        setItems((prev) => [note, ...prev].slice(0, 20));
        // Re-broadcast for other components that care about live updates.
        window.dispatchEvent(new CustomEvent("ss:notify", { detail: p }));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("error", () => {
      // EventSource will auto-reconnect; no UI noise needed.
    });
    return () => es.close();
  }, []);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unread = items.filter((i) => !i.read).length;

  const markAll = () =>
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ss-btn-ghost relative !px-2"
        aria-label="Notifications"
      >
        <Bell size={14} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-fuchsia-500 px-1 text-[10px] font-semibold text-white shadow-lg shadow-fuchsia-500/40">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-white/10 bg-black/80 shadow-xl shadow-black/40 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2 text-xs">
            <span className="font-semibold text-white">Notifications</span>
            {items.length > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="flex items-center gap-1 text-white/50 hover:text-white"
              >
                <Check size={11} /> Mark read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-white/40">
                You&apos;re all caught up.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.map((i) => {
                  const Inner = (
                    <div
                      className={`flex flex-col gap-0.5 px-3 py-2 text-xs ${
                        i.read ? "text-white/60" : "text-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {labelFor(i.kind)}
                          {i.from ? ` · ${i.from}` : ""}
                        </span>
                        {!i.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                        )}
                      </div>
                      <span className="line-clamp-2 text-white/70">{i.preview}</span>
                      <span className="text-[10px] text-white/40">
                        {new Date(i.at).toLocaleString()}
                      </span>
                    </div>
                  );
                  return (
                    <li key={i.id}>
                      {i.href ? (
                        <Link
                          href={i.href}
                          onClick={() => setOpen(false)}
                          className="block hover:bg-white/[0.03]"
                        >
                          {Inner}
                        </Link>
                      ) : (
                        Inner
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function labelFor(kind: string): string {
  switch (kind) {
    case "message":
      return "New message";
    case "request":
    case "request.updated":
      return "Booking update";
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

function hrefFor(p: Record<string, unknown>): string | undefined {
  const k = p.kind ?? p.type;
  if (k === "message") return "/dashboard";
  if (k === "request" || k === "request.updated") return "/dashboard";
  return undefined;
}
