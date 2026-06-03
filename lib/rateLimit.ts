import { getPublisher } from "./redis";

/**
 * Tiny token-bucket-ish rate limiter on top of Redis INCR + EXPIRE.
 *
 * Design notes:
 *   - Fixed window per key. Simpler than a true sliding log, ~1 round-trip,
 *     and entirely sufficient for "don't let a single user spam the LLM".
 *   - In-process fallback (Map) so dev without Redis still rate-limits and
 *     tests stay deterministic.
 *   - Failures of Redis are *fail-open*: we'd rather serve a request than
 *     hard-fail a user when our cache layer is down.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // epoch ms
}

interface MemBucket {
  count: number;
  resetAt: number;
}
const memBuckets = new Map<string, MemBucket>();

const REDIS_DISABLED = process.env.REDIS_URL === "" || process.env.REDIS_URL === "disabled";

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const fullKey = `rl:${key}:${Math.floor(nowMs / 1000 / windowSeconds)}`;
  const resetAt = (Math.floor(nowMs / 1000 / windowSeconds) + 1) * windowSeconds * 1000;

  if (REDIS_DISABLED) return memHit(key, limit, windowSeconds, nowMs);

  try {
    const client = getPublisher();
    if (client.status !== "ready" && client.status !== "connecting") {
      // Best-effort connect — don't await long.
      client.connect().catch(() => undefined);
    }
    if (client.status !== "ready") {
      return memHit(key, limit, windowSeconds, nowMs);
    }
    const count = await client.incr(fullKey);
    if (count === 1) {
      await client.pexpire(fullKey, windowSeconds * 1000);
    }
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      limit,
      resetAt,
    };
  } catch {
    // Fail-open with a memory bucket as a soft guard.
    return memHit(key, limit, windowSeconds, nowMs);
  }
}

function memHit(
  key: string,
  limit: number,
  windowSeconds: number,
  nowMs: number,
): RateLimitResult {
  const bucketKey = `${key}:${Math.floor(nowMs / 1000 / windowSeconds)}`;
  const resetAt = (Math.floor(nowMs / 1000 / windowSeconds) + 1) * windowSeconds * 1000;
  const existing = memBuckets.get(bucketKey);
  // Lazy GC — drop expired entries when we trip across them.
  if (existing && existing.resetAt < nowMs) memBuckets.delete(bucketKey);
  const bucket = memBuckets.get(bucketKey) ?? { count: 0, resetAt };
  bucket.count += 1;
  memBuckets.set(bucketKey, bucket);
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    limit,
    resetAt,
  };
}

/** Standard headers to attach to a rate-limited Response. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(Math.floor(r.resetAt / 1000)),
  };
}
