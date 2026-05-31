/**
 * Public structured-data extraction (schema.org JSON-LD).
 *
 * Storefront pages on company sites, DoorDash, Angi, etc. embed schema.org
 * metadata in `<script type="application/ld+json">` blocks — the exact data
 * they hand to Google so the listing shows rich results. Reading it is the
 * legitimate, ToS-friendly way to learn a business's advertised prices and
 * hero image, in the same spirit as the OG-meta `social` adapter. We never
 * touch private content or anything behind auth.
 *
 * This module is pure (string in, data out) so it can be unit tested without
 * the network.
 */
import type { CandidateMedia, CandidatePriceQuote } from "./types";

interface JsonLdNode {
  "@type"?: string | string[];
  name?: string;
  image?: unknown;
  url?: string;
  offers?: unknown;
  hasMenu?: unknown;
  itemListElement?: unknown;
  [key: string]: unknown;
}

const SCRIPT_RE =
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Parse every JSON-LD block in an HTML string into a flat node list. */
export function parseJsonLd(html: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  let m: RegExpExecArray | null;
  SCRIPT_RE.lastIndex = 0;
  while ((m = SCRIPT_RE.exec(html))) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      collect(parsed, nodes);
    } catch {
      // Malformed block — skip, never throw on hostile input.
    }
  }
  return nodes;
}

function collect(value: unknown, out: JsonLdNode[]): void {
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out);
    return;
  }
  if (value && typeof value === "object") {
    const node = value as JsonLdNode;
    out.push(node);
    if (node["@graph"]) collect(node["@graph"], out);
  }
}

function typesOf(node: JsonLdNode): string[] {
  const t = node["@type"];
  if (!t) return [];
  return (Array.isArray(t) ? t : [t]).map((s) => String(s).toLowerCase());
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    // Keep digits, dot, and a leading sign; drop currency symbols + thousands
    // separators ("$1,299.00" → "1299.00", "-122.39" → "-122.39"). Reject
    // anything that isn't a single well-formed decimal so malformed strings
    // like "12.34.56" don't silently parse to a wrong value. Sign is preserved
    // here (geo coordinates are legitimately negative); price callers enforce
    // non-negativity separately.
    const cleaned = v.replace(/[^0-9.-]/g, "");
    if (!/^-?\d*\.?\d+$/.test(cleaned)) return undefined;
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function firstImage(image: unknown): string | undefined {
  if (typeof image === "string") return image;
  if (Array.isArray(image)) {
    for (const i of image) {
      const r = firstImage(i);
      if (r) return r;
    }
    return undefined;
  }
  if (image && typeof image === "object") {
    const u = (image as { url?: unknown }).url;
    if (typeof u === "string") return u;
  }
  return undefined;
}

/** Pull price + currency out of an Offer / AggregateOffer node. */
function offerPrice(offer: JsonLdNode): { amount?: number; currency?: string } {
  const amount =
    toNumber(offer.price) ??
    toNumber(offer.lowPrice) ??
    toNumber((offer.priceSpecification as JsonLdNode | undefined)?.price);
  const currency =
    (typeof offer.priceCurrency === "string" && offer.priceCurrency) ||
    (typeof (offer.priceSpecification as JsonLdNode | undefined)?.priceCurrency ===
    "string"
      ? ((offer.priceSpecification as JsonLdNode).priceCurrency as string)
      : undefined);
  return { amount, currency: currency || undefined };
}

/**
 * Extract priced items from a page's JSON-LD.
 *
 * Handles the common shapes: `Product`/`Service` with an `offers` block, a
 * bare `Offer`/`AggregateOffer`, and `Menu`/`ItemList` collections of priced
 * menu items. The business `name` is used as a fallback label for a single
 * headline price.
 */
export function extractPriceQuotes(
  html: string,
  fallbackLabel = "Standard",
): CandidatePriceQuote[] {
  const nodes = parseJsonLd(html);
  const quotes: CandidatePriceQuote[] = [];
  const seen = new Set<string>();

  const push = (label: string, amount?: number, currency?: string, url?: string) => {
    if (typeof amount !== "number" || amount <= 0) return;
    const cleanLabel = label.trim() || fallbackLabel;
    const ccy = currency || "USD";
    const key = `${cleanLabel.toLowerCase()}|${amount}|${ccy}`;
    if (seen.has(key)) return;
    seen.add(key);
    quotes.push({
      label: cleanLabel,
      amount,
      currency: ccy,
      url: url || undefined,
    });
  };

  for (const node of nodes) {
    const types = typesOf(node);
    const isOffer = types.some((t) => t === "offer" || t === "aggregateoffer");
    if (isOffer) {
      const { amount, currency } = offerPrice(node);
      push(
        typeof node.name === "string" ? node.name : fallbackLabel,
        amount,
        currency,
        typeof node.url === "string" ? node.url : undefined,
      );
      continue;
    }

    // Product / Service / MenuItem with nested offers.
    const offers = node.offers;
    const label = typeof node.name === "string" ? node.name : fallbackLabel;
    const url = typeof node.url === "string" ? node.url : undefined;
    const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];
    for (const o of offerList) {
      if (o && typeof o === "object") {
        const { amount, currency } = offerPrice(o as JsonLdNode);
        push(label, amount, currency, url);
      }
    }
  }

  return quotes;
}

/** Extract a hero image (and any gallery images) from a page's JSON-LD. */
export function extractMedia(html: string): CandidateMedia[] {
  const nodes = parseJsonLd(html);
  const media: CandidateMedia[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const img = firstImage(node.image);
    if (img && !seen.has(img)) {
      seen.add(img);
      media.push({ kind: "IMAGE", url: img });
    }
  }
  return media;
}

/** Business display name from the first node that has one. */
export function extractName(html: string): string | undefined {
  for (const node of parseJsonLd(html)) {
    if (typeof node.name === "string" && node.name.trim()) return node.name.trim();
  }
  return undefined;
}

export interface BusinessCore {
  name?: string;
  description?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  reviewCount?: number;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Pull canonical business fields out of a LocalBusiness / Organization /
 * Restaurant / Service node. Picks the first node that carries geo or an
 * address so enrichment URLs resolve to a real, dedup-able place.
 */
export function extractBusinessCore(html: string): BusinessCore {
  const nodes = parseJsonLd(html);
  const core: BusinessCore = {};
  for (const node of nodes) {
    if (!core.name) core.name = str(node.name);
    if (!core.description) core.description = str(node.description);
    if (!core.website) core.website = str(node.url);
    if (!core.phone) core.phone = str(node.telephone);

    const addr = node.address;
    if (addr && typeof addr === "object" && !Array.isArray(addr)) {
      const a = addr as Record<string, unknown>;
      core.address = core.address ?? str(a.streetAddress);
      core.city = core.city ?? str(a.addressLocality);
      core.region = core.region ?? str(a.addressRegion);
      core.postalCode = core.postalCode ?? str(a.postalCode);
      core.country = core.country ?? str(a.addressCountry);
    } else if (typeof addr === "string") {
      core.address = core.address ?? str(addr);
    }

    const geo = node.geo;
    if (geo && typeof geo === "object") {
      const g = geo as Record<string, unknown>;
      const lat = toNumber(g.latitude);
      const lng = toNumber(g.longitude);
      if (core.lat === undefined && typeof lat === "number") core.lat = lat;
      if (core.lng === undefined && typeof lng === "number") core.lng = lng;
    }

    const agg = node.aggregateRating;
    if (agg && typeof agg === "object") {
      const r = agg as Record<string, unknown>;
      core.rating = core.rating ?? toNumber(r.ratingValue);
      core.reviewCount =
        core.reviewCount ?? toNumber(r.reviewCount) ?? toNumber(r.ratingCount);
    }
  }
  return core;
}
