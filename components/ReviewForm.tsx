"use client";

import { useActionState, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { leaveReviewAction } from "@/app/actions/reviews";
import type { ActionResult } from "@/app/actions/auth";
import { toast } from "@/components/Toaster";

/**
 * Inline review form, rendered on a completed request row in the consumer
 * dashboard. Idempotent — re-submitting updates the existing review, so we
 * use this same form to "edit" too.
 */
export function ReviewForm({
  requestId,
  initialRating = 0,
  initialBody = "",
}: {
  requestId: string;
  initialRating?: number;
  initialBody?: string;
}) {
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(initialBody);
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    async (prev, fd) => {
      const res = await leaveReviewAction(prev, fd);
      if (res.ok) toast({ title: "Thanks for the review!", tone: "success" });
      else toast({ title: res.error, tone: "error" });
      return res;
    },
    undefined,
  );

  const display = hover || rating;

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="rating" value={rating} />
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/60">Your rating</span>
        <div className="flex" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className="p-0.5 text-amber-300 transition hover:scale-110"
              aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
            >
              <Star
                size={18}
                className={n <= display ? "fill-current" : "text-white/20"}
              />
            </button>
          ))}
        </div>
      </div>
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What was it like? (optional)"
        rows={2}
        maxLength={2000}
        className="ss-input resize-none text-sm"
      />
      <div className="flex items-center justify-between">
        {state && !state.ok ? (
          <span className="text-xs text-rose-300">{state.error}</span>
        ) : (
          <span className="text-[11px] text-white/40">
            Visible publicly on the listing.
          </span>
        )}
        <button
          type="submit"
          disabled={pending || rating === 0}
          className="ss-btn-primary text-xs"
        >
          {pending && <Loader2 size={12} className="animate-spin" />}
          {initialRating > 0 ? "Update review" : "Submit review"}
        </button>
      </div>
    </form>
  );
}
