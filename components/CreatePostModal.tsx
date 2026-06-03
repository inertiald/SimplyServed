"use client";

import { useState, useTransition } from "react";
import { Tag, Briefcase, MessageSquare, Loader2, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPostAction } from "@/app/actions/posts";

type Mode = "GENERAL" | "BUSINESS" | "OFFER";

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
      role="dialog"
      aria-modal="true"
    >
      <div className="ss-card relative w-full max-w-lg overflow-hidden p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <h2 className="text-lg font-semibold text-white">Share to your neighborhood</h2>
        <p className="mt-0.5 text-xs text-white/50">
          Posts are visible to people in the same hex cell as you.
        </p>

        {/* Mode toggle */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-white/5 p-1 text-xs">
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
            <label className="ss-label">From listing</label>
            <select
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
          <label className="ss-label">What&apos;s up?</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="ss-input resize-none"
            placeholder="A new pop-up on Larch St., a lost cat, or a pizza deal…"
            required
            maxLength={2000}
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
                    aria-label="Remove"
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
                type="checkbox"
                checked={includeOffer}
                onChange={(e) => setIncludeOffer(e.target.checked)}
                disabled={mode === "OFFER"}
              />
              Make this a coupon offer
            </label>
            {includeOffer && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  className="ss-input col-span-1"
                  placeholder="CODE"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                />
                <input
                  className="ss-input col-span-1"
                  placeholder="20% off"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  required
                />
                <input
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

        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

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
