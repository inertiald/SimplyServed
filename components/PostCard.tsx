"use client";

import { useState } from "react";
import { Tag, Briefcase, MessageSquare, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PostCardData {
  id: string;
  postType: "GENERAL" | "BUSINESS" | "OFFER";
  contentText: string;
  mediaType: "IMAGE" | "VIDEO" | "TEXT_ONLY";
  mediaUrls: string[] | null;
  createdAt: string;
  lat: number;
  lng: number;
  user: { id: string; name: string; avatarUrl: string | null };
  listing: { id: string; title: string; category?: string } | null;
  metadata?: { offer?: { code: string; discount: string; expiresAt: string } } | null;
}

const TYPE_META = {
  GENERAL: { label: "Neighborhood", icon: MessageSquare, tone: "from-sky-500/30 to-cyan-500/30 text-sky-200" },
  BUSINESS: { label: "Business", icon: Briefcase, tone: "from-amber-500/30 to-orange-500/30 text-amber-200" },
  OFFER: { label: "Offer", icon: Tag, tone: "from-fuchsia-500/30 to-pink-500/30 text-fuchsia-200" },
} as const;

export function PostCard({ post }: { post: PostCardData }) {
  const meta = TYPE_META[post.postType];
  const Icon = meta.icon;
  const offer = post.metadata?.offer;
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!offer) return;
    try {
      await navigator.clipboard.writeText(offer.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <article className="ss-card animate-fade-in p-5">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-semibold uppercase text-white">
            {post.user.name.charAt(0)}
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">{post.user.name}</div>
            <div className="text-xs text-white/40">
              {timeAgo(post.createdAt)}
              {post.listing && <> · {post.listing.title}</>}
            </div>
          </div>
        </div>
        <span className={cn("ss-chip bg-gradient-to-br", meta.tone)}>
          <Icon size={12} /> {meta.label}
        </span>
      </header>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">{post.contentText}</p>

      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {post.mediaUrls.map((url) =>
            post.mediaType === "VIDEO" ? (
              <video
                key={url}
                src={url}
                controls
                playsInline
                className="aspect-square w-full rounded-xl object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="aspect-square w-full rounded-xl object-cover"
              />
            ),
          )}
        </div>
      )}

      {offer && (
        <div className="mt-4 rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 to-pink-500/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fuchsia-200/70">Live offer</div>
              <div className="text-lg font-semibold text-white">{offer.discount}</div>
              <div className="text-xs text-white/50">
                Expires {new Date(offer.expiresAt).toLocaleDateString()}
              </div>
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="ss-btn bg-white text-black hover:bg-white/90"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span className="font-mono text-xs">{offer.code}</span>
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
