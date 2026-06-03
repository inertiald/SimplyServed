/**
 * Shared types for the OSINT scraper subsystem.
 *
 * - `RawBusiness`  — the unprocessed payload from a single source. Stored
 *                    verbatim on `BusinessSource.rawPayload` for audit.
 * - `NormalizedBusiness` — the source-agnostic shape we merge into a
 *                          canonical `BusinessProfile`. Columns map 1:1.
 *
 * Adapters convert `RawBusiness` → `NormalizedBusiness` via their `normalize`
 * function. The runner is the only thing that ever touches Prisma.
 */
import type { ScrapeSource } from "@prisma/client";

export interface RawBusiness {
  source: ScrapeSource;
  sourceUrl: string;
  externalId?: string;
  /** The raw provider payload — JSON-serializable. */
  payload: unknown;
  /** Optional ETag / Last-Modified-like marker used for re-fetch skipping. */
  etag?: string;
}

export interface CandidateMedia {
  kind: "IMAGE" | "VIDEO";
  url: string;
  caption?: string;
}

/**
 * One advertised price discovered on a source. The runner maps this onto a
 * `BusinessPriceQuote` row. `channel` defaults to the source's natural channel
 * when omitted (e.g. the DoorDash adapter implies the DOORDASH channel).
 */
export interface CandidatePriceQuote {
  channel?:
    | "DIRECT"
    | "DOORDASH"
    | "UBEREATS"
    | "GRUBHUB"
    | "ANGI"
    | "THUMBTACK"
    | "OTHER";
  label: string;
  amount: number;
  currency?: string;
  unit?: string;
  url?: string;
  available?: boolean;
  externalId?: string;
}

export interface NormalizedBusiness {
  source: ScrapeSource;
  sourceUrl: string;
  externalId?: string;

  name: string;
  description?: string;
  category?: string;
  phone?: string;
  email?: string;
  website?: string;

  address?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;

  lat?: number;
  lng?: number;

  hours?: Record<string, unknown>;
  socialLinks?: Record<string, string>;
  tags?: string[];

  rating?: number;
  reviewCount?: number;

  media?: CandidateMedia[];
  priceQuotes?: CandidatePriceQuote[];
}

export interface ScraperTarget {
  /** Human-readable slug used as the `ScrapeJob.target` value. */
  target: string;
  /** Optional pagination cursor resumed from a previous run. */
  cursor?: unknown;
}

export interface DiscoverResult {
  items: RawBusiness[];
  /** Set when there is more to fetch — persisted to `ScrapeJob.cursor`. */
  nextCursor?: unknown;
}

export interface Scraper {
  /** Stable identifier used in env flags + logs (e.g. `"osm"`). */
  id: string;
  /** Matches `BusinessSource.source`. */
  source: ScrapeSource;
  /** Returns false if e.g. a required API key isn't set. */
  enabled(): boolean;
  /** Discover candidate businesses for a given target. */
  discover(target: ScraperTarget): Promise<DiscoverResult>;
  /** Normalize a raw payload into our canonical shape. */
  normalize(raw: RawBusiness): NormalizedBusiness | null;
}
