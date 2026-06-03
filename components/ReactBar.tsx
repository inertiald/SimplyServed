"use client";

import { useState, useTransition } from "react";
import { Heart, ThumbsUp, Sparkles } from "lucide-react";
import { reactToListingAction } from "@/app/actions/posts";

export function ReactBar({ listingId }: { listingId: string }) {
  const [pending, start] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  const react = (r: "LIKE" | "LOVE" | "WOW") => {
    setLast(r);
    start(async () => {
      await reactToListingAction(listingId, r);
    });
  };

  return (
    <div className="ml-auto flex items-center gap-1">
      {(
        [
          { key: "LIKE", icon: ThumbsUp },
          { key: "LOVE", icon: Heart },
          { key: "WOW", icon: Sparkles },
        ] as const
      ).map(({ key, icon: Icon }) => (
        <button
          key={key}
          disabled={pending}
          onClick={() => react(key)}
          className={`rounded-full border border-white/10 p-2 transition hover:bg-white/10 ${
            last === key ? "bg-fuchsia-500/20 text-fuchsia-200" : "text-white/70"
          }`}
          aria-label={key.toLowerCase()}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
