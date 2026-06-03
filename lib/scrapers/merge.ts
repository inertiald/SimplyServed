/**
 * Dedup + merge logic for scraped business profiles.
 *
 * This is the riskiest module in the scraper pipeline — bad merges silently
 * corrupt user-facing data. Keep it pure, deterministic, and well-tested
 * (see `__tests__/merge.test.ts`).
 *
 * Strategy (in order):
 *   1. Same (source, externalId) → update existing source row in place.
 *   2. Same dedupeKey            → attach this source to existing profile.
 *   3. Fuzzy match               → propose merge or queue for admin review.
 *
 * Field-merge precedence (per `pickField`):
 *   GOOGLE > YELP > CHAMBER > BBB > YELLOWPAGES > OPENSTREETMAP > others
 *
 * All raw payloads survive on `BusinessSource.rawPayload`, so a bad merge is
 * always recoverable.
 */
import crypto from "node:crypto";
import type { ScrapeSource } from "@prisma/client";
import type { NormalizedBusiness } from "./types";

const SOURCE_PRIORITY: Record<ScrapeSource, number> = {
  GOOGLE: 100,
  YELP: 90,
  CHAMBER: 80,
  BBB: 70,
  YELLOWPAGES: 60,
  // Commerce marketplaces: rich storefront data (images, descriptions) but
  // below authoritative directories for canonical fields like name/address.
  ANGI: 55,
  THUMBTACK: 52,
  DOORDASH: 50,
  UBEREATS: 48,
  GRUBHUB: 46,
  WEBSITE: 45,
  OPENSTREETMAP: 40,
  FACEBOOK: 30,
  INSTAGRAM: 30,
  OTHER: 10,
};

// --- normalization -----------------------------------------------------------

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[''’`]/g, "") // strip apostrophes so "Joe's" == "Joes"
    .replace(/&/g, " and ")
    .replace(/\b(the|inc|llc|ltd|co|corp|company|corporation)\b/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strict E.164-ish digits-only key (best-effort, no libphonenumber dep). */
export function normalizePhone(phone: string | undefined | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D+/g, "");
  if (!digits) return "";
  // Treat NANP without country code as US (most chambers/yellowpages omit +1).
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

/** Round coords to a ~30m bucket so "same building" entries collide. */
export function geoBucket(lat: number | undefined, lng: number | undefined): string {
  if (typeof lat !== "number" || typeof lng !== "number") return "";
  // 3 decimals ≈ 110m; 4 decimals ≈ 11m. Use 3 to give phone/name a chance
  // to also match without being so loose that next-door shops collide.
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

export function computeDedupeKey(b: {
  name: string;
  phone?: string;
  lat?: number;
  lng?: number;
}): string {
  const name = normalizeName(b.name);
  const phone = normalizePhone(b.phone);
  const geo = geoBucket(b.lat, b.lng);
  // Use the strongest available signals. If we only have a name, that's all
  // we have — fuzzy match will catch most near-dupes downstream.
  const composite = [name, phone, geo].filter(Boolean).join("|");
  return crypto.createHash("sha256").update(composite).digest("hex");
}

// --- garbage filter ----------------------------------------------------------

const NAME_STOP_LIST = new Set([
  "test",
  "untitled",
  "tbd",
  "permanently closed",
  "closed",
  "n/a",
  "na",
  "?",
]);

export interface RejectReason {
  reason: string;
  source: ScrapeSource;
  url?: string;
}

/**
 * Returns null if the candidate is clean, or a reason if it should be dropped.
 *
 * This is the "no incomprehensible garbage" gate. Be conservative — false
 * positives here mean we throw away real data.
 */
export function rejectIfGarbage(b: NormalizedBusiness): RejectReason | null {
  if (!b.name || b.name.trim().length < 2) {
    return { reason: "missing-name", source: b.source, url: b.sourceUrl };
  }
  const normName = normalizeName(b.name);
  if (!normName || normName.length < 2) {
    return { reason: "name-non-alphanumeric", source: b.source, url: b.sourceUrl };
  }
  if (NAME_STOP_LIST.has(normName)) {
    return { reason: `name-stop-list:${normName}`, source: b.source, url: b.sourceUrl };
  }
  if (typeof b.lat !== "number" || typeof b.lng !== "number") {
    return { reason: "missing-geo", source: b.source, url: b.sourceUrl };
  }
  if (
    b.lat < -90 ||
    b.lat > 90 ||
    b.lng < -180 ||
    b.lng > 180 ||
    (b.lat === 0 && b.lng === 0)
  ) {
    return { reason: "invalid-geo", source: b.source, url: b.sourceUrl };
  }
  if (b.description && /[\x00-\x08\x0e-\x1f]/.test(b.description)) {
    return { reason: "description-binary", source: b.source, url: b.sourceUrl };
  }
  return null;
}

// --- field merge -------------------------------------------------------------

interface SourceFieldCandidate {
  value: unknown;
  source: ScrapeSource;
}

/**
 * Pick the highest-priority non-empty value across candidates. Stable: equal
 * priorities resolve by insertion order, so the first source wins (which is
 * usually the freshest one in the runner).
 */
export function pickField<T>(candidates: SourceFieldCandidate[]): T | undefined {
  let best: SourceFieldCandidate | undefined;
  for (const c of candidates) {
    if (c.value === undefined || c.value === null) continue;
    if (typeof c.value === "string" && c.value.trim() === "") continue;
    if (Array.isArray(c.value) && c.value.length === 0) continue;
    if (!best || SOURCE_PRIORITY[c.source] > SOURCE_PRIORITY[best.source]) {
      best = c;
    }
  }
  return best ? (best.value as T) : undefined;
}

export interface MergeResult {
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
  ratingAvg: number;
  ratingCount: number;
}

/**
 * Merge a set of `NormalizedBusiness` rows (from one or more sources) into a
 * single canonical view. `owned` is an optional mask of field names the
 * `Listing` owner has overridden — those fields are left undefined here so
 * the caller knows to skip them on update.
 */
export function mergeProfiles(
  inputs: NormalizedBusiness[],
  ownerOverrides: Record<string, boolean> = {},
): MergeResult {
  if (inputs.length === 0) throw new Error("mergeProfiles: no inputs");

  const get = <K extends keyof NormalizedBusiness>(k: K): SourceFieldCandidate[] =>
    inputs.map((i) => ({ value: i[k], source: i.source }));

  const pick = <T>(k: keyof NormalizedBusiness): T | undefined =>
    ownerOverrides[k as string] ? undefined : pickField<T>(get(k));

  // Weighted rating: sum(rating_i * count_i) / sum(count_i).
  let weighted = 0;
  let totalCount = 0;
  for (const i of inputs) {
    if (typeof i.rating === "number" && typeof i.reviewCount === "number" && i.reviewCount > 0) {
      weighted += i.rating * i.reviewCount;
      totalCount += i.reviewCount;
    }
  }
  const ratingAvg = totalCount > 0 ? weighted / totalCount : 0;

  // Tags: union across sources (deduped, sorted for stable output).
  const tagSet = new Set<string>();
  for (const i of inputs) for (const t of i.tags ?? []) tagSet.add(t.toLowerCase());
  const tags = ownerOverrides.tags ? undefined : [...tagSet].sort();

  return {
    name: pick<string>("name") ?? inputs[0].name,
    description: pick<string>("description"),
    category: pick<string>("category"),
    phone: pick<string>("phone"),
    email: pick<string>("email"),
    website: pick<string>("website"),
    address: pick<string>("address"),
    city: pick<string>("city"),
    region: pick<string>("region"),
    postalCode: pick<string>("postalCode"),
    country: pick<string>("country"),
    lat: pick<number>("lat"),
    lng: pick<number>("lng"),
    hours: pick<Record<string, unknown>>("hours"),
    socialLinks: pick<Record<string, string>>("socialLinks"),
    tags,
    ratingAvg,
    ratingCount: totalCount,
  };
}

// --- fuzzy matching ----------------------------------------------------------

/** Token-set ratio in [0,1]. Cheap Jaccard on space-split tokens. */
export function nameSimilarity(a: string, b: string): number {
  const aT = new Set(normalizeName(a).split(/\s+/).filter(Boolean));
  const bT = new Set(normalizeName(b).split(/\s+/).filter(Boolean));
  if (aT.size === 0 || bT.size === 0) return 0;
  let inter = 0;
  for (const t of aT) if (bT.has(t)) inter++;
  const union = aT.size + bT.size - inter;
  return inter / union;
}

/** Haversine distance in meters. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface FuzzyMatchInput {
  name: string;
  phone?: string;
  lat?: number;
  lng?: number;
}

/**
 * Confidence in [0,1] that `a` and `b` are the same business.
 *
 *   ≥ 0.9 → auto-merge
 *   0.7 .. 0.9 → admin review queue
 *   < 0.7 → distinct
 */
export function matchConfidence(a: FuzzyMatchInput, b: FuzzyMatchInput): number {
  const name = nameSimilarity(a.name, b.name);
  const phoneMatch =
    normalizePhone(a.phone) && normalizePhone(a.phone) === normalizePhone(b.phone);
  let distance = Infinity;
  if (
    typeof a.lat === "number" &&
    typeof a.lng === "number" &&
    typeof b.lat === "number" &&
    typeof b.lng === "number"
  ) {
    distance = haversineMeters(
      { lat: a.lat, lng: a.lng },
      { lat: b.lat, lng: b.lng },
    );
  }

  // Strong signals: phone identical OR (very similar name + very close).
  if (phoneMatch && name >= 0.6) return 0.95;
  if (name >= 0.9 && distance <= 100) return 0.95;
  if (name >= 0.85 && distance <= 250) return 0.85;
  if (name >= 0.75 && distance <= 500) return 0.75;
  if (name >= 0.9 && distance === Infinity) return 0.7;
  return Math.min(name, distance < 1000 ? 0.7 : 0.5) * 0.6;
}

export const MERGE_AUTO_THRESHOLD = 0.9;
export const MERGE_REVIEW_THRESHOLD = 0.7;
