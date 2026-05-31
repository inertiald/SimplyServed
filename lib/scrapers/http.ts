/**
 * Polite HTTP client for scrapers.
 *
 *  - Per-host token-bucket via `lib/rateLimit.ts` (Redis-backed when present).
 *  - Exponential backoff with jitter on 429/5xx; `Retry-After` honored.
 *  - Descriptive UA with a contact URL — bots that identify themselves get
 *    rate-limited instead of banned.
 *  - `robots.txt` checked + cached before every request.
 *  - Global circuit breaker — admins can flip `scraper:halt` in Redis to stop
 *    all outbound scrape traffic without redeploying.
 */
import { rateLimit } from "@/lib/rateLimit";
import { getPublisher } from "@/lib/redis";
import { BOT_UA, checkRobots } from "./robots";

export const USER_AGENT = `${BOT_UA}/1.0 (+https://simplyserved.dev/bot; respects robots.txt)`;

const DEFAULT_PER_HOST_RPS = 1; // be polite
const DEFAULT_PER_HOST_WINDOW_S = 1;
const MAX_RETRIES = 4;

export class RobotsDisallowed extends Error {
  constructor(public url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = "RobotsDisallowed";
  }
}

export class CircuitBreakerOpen extends Error {
  constructor() {
    super("Scraper circuit breaker is open (set scraper:halt in Redis to clear)");
    this.name = "CircuitBreakerOpen";
  }
}

export class RateLimitedError extends Error {
  constructor(public host: string, public retryAfterMs: number) {
    super(`rate limited by ${host} (retry in ${retryAfterMs}ms)`);
    this.name = "RateLimitedError";
  }
}

async function circuitOpen(): Promise<boolean> {
  try {
    const r = getPublisher();
    if (r.status !== "ready") {
      await r.connect().catch(() => undefined);
    }
    if (r.status !== "ready") return false;
    const v = await r.get("scraper:halt");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export interface PoliteFetchOptions extends RequestInit {
  /** Override per-host RPS. */
  perHostRps?: number;
  /** Skip robots check (use ONLY for own-origin or fetching robots.txt itself). */
  skipRobots?: boolean;
  /** Max retries on 429/5xx. */
  maxRetries?: number;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(baseMs: number): number {
  return baseMs + Math.floor(Math.random() * baseMs);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const n = Number(header);
  if (!Number.isNaN(n)) return n * 1000;
  const t = Date.parse(header);
  if (!Number.isNaN(t)) return Math.max(0, t - Date.now());
  return null;
}

/**
 * Politely fetch a URL. Throws on persistent failure or robots disallow.
 *
 * Callers should treat `RobotsDisallowed` / `CircuitBreakerOpen` /
 * `RateLimitedError` as terminal for the current job (skip + record).
 */
export async function politeFetch(
  url: string,
  opts: PoliteFetchOptions = {},
): Promise<Response> {
  if (await circuitOpen()) throw new CircuitBreakerOpen();

  const u = new URL(url);
  const host = u.host;

  if (!opts.skipRobots) {
    const robots = await checkRobots(url);
    if (!robots.allowed) throw new RobotsDisallowed(url);
    if (robots.crawlDelayMs > 0) await sleep(robots.crawlDelayMs);
  }

  const rps = opts.perHostRps ?? DEFAULT_PER_HOST_RPS;
  // Token-bucket-ish: at most `rps` requests per `DEFAULT_PER_HOST_WINDOW_S`s.
  for (let waited = 0; waited < 10_000; waited += 250) {
    const res = await rateLimit(`scrape:host:${host}`, rps, DEFAULT_PER_HOST_WINDOW_S);
    if (res.allowed) break;
    await sleep(250);
  }

  const headers = new Headers(opts.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
  if (!headers.has("Accept")) headers.set("Accept", "application/json, text/html;q=0.9, */*;q=0.5");

  const maxRetries = opts.maxRetries ?? MAX_RETRIES;
  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers,
        signal: opts.signal ?? AbortSignal.timeout(15_000),
      });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        if (attempt === maxRetries) {
          if (res.status === 429) {
            throw new RateLimitedError(host, retryAfter ?? jitter(1000 * 2 ** attempt));
          }
          return res;
        }
        await sleep(retryAfter ?? jitter(500 * 2 ** attempt));
        attempt++;
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (err instanceof RateLimitedError || err instanceof RobotsDisallowed) throw err;
      if (attempt === maxRetries) break;
      await sleep(jitter(500 * 2 ** attempt));
      attempt++;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`fetch failed: ${url}`);
}

/** Convenience JSON helper. */
export async function politeFetchJson<T = unknown>(
  url: string,
  opts: PoliteFetchOptions = {},
): Promise<T> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}
