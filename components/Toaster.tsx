"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: string;
  title: string;
  tone?: ToastTone;
  /** Auto-dismiss after N ms. Default 4000. Set to 0 to make sticky. */
  durationMs?: number;
}

const EVENT = "ss:toast";

/**
 * Imperative toast helper. Components anywhere on the page can call this
 * without prop-drilling — the global <Toaster /> mounted in the root layout
 * subscribes to the same window event.
 */
export function toast(t: Omit<Toast, "id"> & { id?: string }) {
  if (typeof window === "undefined") return;
  const detail: Toast = {
    id: t.id ?? crypto.randomUUID(),
    title: t.title,
    tone: t.tone ?? "info",
    durationMs: t.durationMs,
  };
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
}

/** Mounted once globally in app/layout.tsx. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent).detail as Toast;
      if (!t || !t.title) return;
      setItems((prev) => [...prev, t].slice(-5));
      const dur = t.durationMs ?? 4000;
      if (dur > 0) {
        setTimeout(() => {
          setItems((prev) => prev.filter((x) => x.id !== t.id));
        }, dur);
      }
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {items.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          onClose={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
        />
      ))}
    </div>
  );
}

function ToastCard({ toast: t, onClose }: { toast: Toast; onClose: () => void }) {
  const tone = t.tone ?? "info";
  const Icon =
    tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : Info;
  const ring =
    tone === "success"
      ? "border-emerald-500/40 shadow-emerald-500/20"
      : tone === "error"
        ? "border-rose-500/40 shadow-rose-500/20"
        : "border-indigo-500/40 shadow-indigo-500/20";
  const text =
    tone === "success"
      ? "text-emerald-200"
      : tone === "error"
        ? "text-rose-200"
        : "text-indigo-200";
  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-black/80 px-4 py-3 text-sm text-white shadow-xl backdrop-blur-xl ${ring}`}
    >
      <Icon size={16} className={`mt-0.5 shrink-0 ${text}`} />
      <span className="flex-1">{t.title}</span>
      <button
        type="button"
        onClick={onClose}
        className="text-white/40 hover:text-white"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
