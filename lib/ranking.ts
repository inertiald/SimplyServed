/**
 * Smart Discover Feed — ranking primitives.
 *
 * Design goals (MVP):
 *  - No AI, no Redis, no personalisation.
 *  - Simple enough to read in five minutes.
 *  - Easy to extend: swap weight constants or add new signals later.
 */

// ---------------------------------------------------------------------------
// Unified feed-item types
// ---------------------------------------------------------------------------

export interface PostFeedItem {
  kind: "post";
  id: string;
  score: number;
  createdAt: Date;
  h3Neighborhood: string;
  postType: string;
  contentText: string;
  mediaType: "IMAGE" | "VIDEO" | "TEXT_ONLY";
  mediaUrls: string[] | null;
  metadata?: { offer?: { code: string; discount: string; expiresAt: string } } | null;
  lat: number;
  lng: number;
  user: { id: string; name: string; avatarUrl: string | null };
  listing: { id: string; title: string; category: string } | null;
  rank: {
    label: "Trending" | "Recent";
    reasons: string[];
  };
}

export interface ListingFeedItem {
  kind: "listing";
  id: string;
  score: number;
  createdAt: Date;
  h3Neighborhood: string;
  title: string;
  description: string;
  category: string;
  hourlyRate: number;
  lat: number;
  lng: number;
  ratingAvg: number;
  ratingCount: number;
  impressionCount: number;
  requestCount: number;
  provider: { id: string; name: string; avatarUrl: string | null };
  rank: {
    label: "Trending" | "Recommended" | "Popular Nearby" | "Highly Rated";
    reasons: string[];
  };
}

export type FeedItem = PostFeedItem | ListingFeedItem;

/** Convenience aliases for items before the score is attached. */
export type UnscaledPostFeedItem = Omit<PostFeedItem, "score">;
export type UnscaledListingFeedItem = Omit<ListingFeedItem, "score">;
export type UnscaledFeedItem = UnscaledPostFeedItem | UnscaledListingFeedItem;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Weights must sum to 1.0 so the final score stays in [0, 1].
 * Tweak constants here — no logic changes needed elsewhere.
 */
const W = {
  recency: 0.5,
  engagement: 0.3,
  rating: 0.2,
} as const;

/**
 * Recency decay: exponential with a half-life of ~69 h.
 * New content (0 h old) → 1.0; 69 h old → 0.5; 1 week → ~0.16.
 * Constant = ln(2) × 100.
 */
function recencyScore(createdAt: Date): number {
  const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  return Math.exp(-ageHours / 69.3); // half-life ≈ 69.3 h (ln2 × 100)
}

/**
 * Engagement score: impressions + requests, saturating via logistic curve.
 * impressions are worth 1 point each, requests (higher intent) worth 10 each.
 * Score saturates at 1.0 as total points → ∞.
 */
function engagementScore(impressionCount: number, requestCount: number): number {
  const points = impressionCount * 1 + requestCount * 10;
  return points / (points + 100); // saturation: 100 pts → 0.5, 300 pts → 0.75
}

/**
 * Rating score: Bayesian average blended with a minimum confidence threshold.
 * Uses a Wilson-like prior (prior mean = 3.5/5, prior weight = 3 reviews).
 */
function ratingScore(ratingAvg: number, ratingCount: number): number {
  if (ratingCount === 0) return 0;
  const priorMean = 3.5 / 5; // 0.7 normalised
  const priorWeight = 3;
  const normalised = ratingAvg / 5;
  return (priorMean * priorWeight + normalised * ratingCount) / (priorWeight + ratingCount);
}

/**
 * Compute a [0, 1] ranking score for any FeedItem.
 * Higher is better. Used to sort the unified discover feed.
 */
export function computeScore(item: UnscaledFeedItem): number {
  const r = recencyScore(item.createdAt);

  if (item.kind === "listing") {
    const e = engagementScore(item.impressionCount, item.requestCount);
    const g = ratingScore(item.ratingAvg, item.ratingCount);
    return W.recency * r + W.engagement * e + W.rating * g;
  }

  // Posts: only recency matters in MVP (no per-post engagement model yet).
  return r;
}
