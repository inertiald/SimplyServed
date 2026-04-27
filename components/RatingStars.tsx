import { Star } from "lucide-react";

/**
 * Compact 5-star rating display. Use for listing cards / headers.
 * Half-star rendering is intentionally avoided — clearer signal for users,
 * cheaper to lint, and our `ratingAvg` is rounded to one decimal anyway.
 */
export function RatingStars({
  value,
  count,
  size = 12,
  showCount = true,
}: {
  value: number;
  count?: number;
  size?: number;
  showCount?: boolean;
}) {
  const filled = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1 text-amber-300">
      <span className="flex" aria-label={`Rated ${value} out of 5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={size}
            className={i < filled ? "fill-current" : "text-white/15"}
          />
        ))}
      </span>
      {showCount && (
        <span className="text-[11px] text-white/60">
          {value > 0 ? value.toFixed(1) : "—"}
          {typeof count === "number" && count > 0 && (
            <span className="text-white/40"> ({count})</span>
          )}
        </span>
      )}
    </span>
  );
}
