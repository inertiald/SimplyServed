"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Tag, Briefcase, MessageSquare, Loader2, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPostAction } from "@/app/actions/posts";

type Mode = "GENERAL" | "BUSINESS" | "OFFER";
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ProviderListingOption {
  id: string;
  title: string;
}

export function CreatePostModal({
  open,
  onClose,
  lat,
  lng,
  providerListings,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
  providerListings: ProviderListingOption[];
  onCreated?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const [mode, setMode] = useState<Mode>("GENERAL");
  const [text, setText] = useState("");
  const [listingId, setListingId] = useState("");
  const [includeOffer, setIncludeOffer] = useState(false);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [media, setMedia] = useState<{ url: string; type: "IMAGE" | "VIDEO" }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const canBusiness = providerListings.length > 0;

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const currentFocusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (currentFocusable.length === 0) return;
      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      const data = await res.json();
      setMedia((m) => [
        ...m,
        { url: data.url, type: data.contentType.startsWith("video") ? "VIDEO" : "IMAGE" },
      ]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    setError(null);
    const effectiveMode: Mode = includeOffer && (mode === "BUSINESS" || mode === "OFFER") ? "OFFER" : mode;

    start(async () => {
      const res = await createPostAction({
        postType: effectiveMode,
        contentText: text.trim(),
        mediaType: media.length > 0 ? media[0].type : "TEXT_ONLY",
        mediaUrls: media.map((m) => m.url),
        lat,
        lng,
        listingId: effectiveMode === "GENERAL" ? null : listingId || null,
        offer:
          effectiveMode === "OFFER"
            ? { code, discount, expiresAt }
            : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Reset & close.
      setText("");
      setMedia([]);
      setIncludeOffer(false);
      setCode("");
      setDiscount("");
      setExpiresAt("");
      onCreated?.();
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="ss-card relative w-full max-w-lg overflow-hidden p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Close create post dialog"
        >
          <X size={16} />
        </button>

        <h2 id={headingId} className="text-lg font-semibold text-white">Share to your neighborhood</h2>
        <p id={descriptionId} className="mt-0.5 text-xs text-white/50">
          Posts are visible to people in the same hex cell as you.
        </p>

        {/* Mode toggle */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-white/5 p-1 text-xs" role="group" aria-label="Post type">
          <ModeButton active={mode === "GENERAL"} onClick={() => setMode("GENERAL")} icon={MessageSquare} label="General" />
          <ModeButton
            active={mode === "BUSINESS"}
            disabled={!canBusiness}
            onClick={() => setMode("BUSINESS")}
            icon={Briefcase}
            label="Business"
          />
          <ModeButton
            active={mode === "OFFER"}
            disabled={!canBusiness}
            onClick={() => {
              setMode("OFFER");
              setIncludeOffer(true);
            }}
            icon={Tag}
            label="Offer"
          />
        </div>

        {(mode === "BUSINESS" || mode === "OFFER") && (
          <div className="mt-4">
            <label className="ss-label" htmlFor="create-post-listing">From listing</label>
            <select
              id="create-post-listing"
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
              className="ss-input"
              required
            >
              <option value="" disabled>
                Choose a listing…
              </option>
              {providerListings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4">
          <label className="ss-label" htmlFor="create-post-text">What&apos;s up?</label>
          <textarea
            id="create-post-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="ss-input resize-none"
            placeholder="A new pop-up on Larch St., a lost cat, or a pizza deal…"
            required
            maxLength={2000}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
          />
        </div>

        {/* Media */}
        <div className="mt-3">
          <label className="ss-btn-ghost w-full cursor-pointer text-xs">
            <ImageIcon size={14} />
            {uploading ? "Uploading…" : "Add image or video"}
            <input
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </label>
          {media.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {media.map((m) => (
                <div key={m.url} className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/10">
                  {m.type === "VIDEO" ? (
                    <video src={m.url} className="h-full w-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => setMedia((arr) => arr.filter((x) => x.url !== m.url))}
                    className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5 text-white"
                    aria-label="Remove media item"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {(mode === "BUSINESS" || mode === "OFFER") && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-white">
              <input
                id="create-post-include-offer"
                type="checkbox"
                checked={includeOffer}
                onChange={(e) => setIncludeOffer(e.target.checked)}
                disabled={mode === "OFFER"}
              />
              Make this a coupon offer
            </label>
            {includeOffer && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label htmlFor="create-post-offer-code" className="sr-only">
                  Offer code
                </label>
                <input
                  id="create-post-offer-code"
                  className="ss-input col-span-1"
                  placeholder="CODE"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                />
                <label htmlFor="create-post-offer-discount" className="sr-only">
                  Offer discount
                </label>
                <input
                  id="create-post-offer-discount"
                  className="ss-input col-span-1"
                  placeholder="20% off"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  required
                />
                <label htmlFor="create-post-offer-expires" className="sr-only">
                  Offer expiration date
                </label>
                <input
                  id="create-post-offer-expires"
                  type="date"
                  className="ss-input col-span-2"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  required
                />
              </div>
            )}
          </div>
        )}

        {error && <p id={errorId} role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="ss-btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !text.trim() || uploading}
            className="ss-btn-primary"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Post to neighborhood
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: typeof MessageSquare;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 transition",
        active ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow" : "text-white/70 hover:bg-white/5",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <Icon size={12} /> {label}
    </button>
  );
}
