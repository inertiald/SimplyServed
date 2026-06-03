/**
 * Better Business Bureau (BBB) directory adapter.
 *
 * Targets are BBB search URLs, e.g.:
 *   https://www.bbb.org/search?find_text=plumber&find_loc=Seattle%2C+WA
 *
 * Discovery strategy (in priority order):
 *   1. Schema.org ItemList JSON-LD — BBB embeds this on search results pages
 *      so we read only what they already hand to search engines.
 *   2. HTML regex fallback — parses `/us/…` business-link blocks for pages
 *      that don't carry an ItemList.
 *
 * Gated on SCRAPE_BBB=1 so it never runs by accident.
 * Targets are restricted to bbb.org; any other host returns empty discovery.
 * All HTTP calls go through `politeFetch` which honours robots.txt +
 * per-host rate limits.
 */
import { parseJsonLd } from "./jsonld";
import { politeFetch } from "./http";
import type {
  DiscoverResult,
  NormalizedBusiness,
  RawBusiness,
  Scraper,
  ScraperTarget,
} from "./types";

const BBB_HOST = "bbb.org";

interface BbbPayload {
  name: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  bbbUrl: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Return true when `url` is a bbb.org URL (proper hostname check). */
function isBbbHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "bbb.org" || host.endsWith(".bbb.org");
  } catch {
    // Treat unparseable as BBB so we never leak it as an external website.
    return true;
  }
}

function toNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Extract a BbbPayload from a plain-object business node (JSON-LD LocalBusiness shape). */
function extractBizNode(biz: Record<string, unknown>): BbbPayload | null {
  const name = str(biz.name);
  if (!name) return null;
  const bbbUrl = str(biz.url) ?? "";

  // Address
  let address: string | undefined;
  let city: string | undefined;
  let region: string | undefined;
  let postalCode: string | undefined;
  let country: string | undefined;
  const addr = biz.address;
  if (addr && typeof addr === "object" && !Array.isArray(addr)) {
    const a = addr as Record<string, unknown>;
    address = str(a.streetAddress);
    city = str(a.addressLocality);
    region = str(a.addressRegion);
    postalCode = str(a.postalCode);
    country = str(a.addressCountry);
  }

  // Rating
  let rating: number | undefined;
  let reviewCount: number | undefined;
  const agg = biz.aggregateRating;
  if (agg && typeof agg === "object") {
    const r = agg as Record<string, unknown>;
    rating = toNum(r.ratingValue);
    reviewCount = toNum(r.reviewCount) ?? toNum(r.ratingCount);
  }

  // BBB uses sameAs to link to the business's own website
  let website: string | undefined;
  const sameAs = biz.sameAs;
  if (typeof sameAs === "string" && !isBbbHost(sameAs)) {
    website = sameAs;
  } else if (Array.isArray(sameAs)) {
    for (const s of sameAs) {
      if (typeof s === "string" && !isBbbHost(s)) {
        website = s;
        break;
      }
    }
  }

  // Category — skip generic type names
  const rawType = (Array.isArray(biz["@type"]) ? biz["@type"][0] : biz["@type"]) as
    | string
    | undefined;
  const category =
    str(biz.category) ??
    (rawType && rawType !== "LocalBusiness" && rawType !== "Organization"
      ? rawType
      : undefined);

  return {
    name,
    phone: str(biz.telephone),
    website,
    address,
    city,
    region,
    postalCode,
    country,
    bbbUrl,
    rating,
    reviewCount,
    category,
  };
}

/**
 * Parse a BBB search-results HTML page into raw business items.
 *
 * Exported so tests can call it directly against fixture HTML without
 * touching the network.
 */
export function parseBbbHtml(html: string, searchUrl: string): RawBusiness[] {
  const results: RawBusiness[] = [];

  // ── Path 1: JSON-LD ItemList ─────────────────────────────────────────────
  for (const node of parseJsonLd(html)) {
    const types = (
      Array.isArray(node["@type"]) ? node["@type"] : [node["@type"] ?? ""]
    ) as string[];
    if (!types.map((t) => t.toLowerCase()).includes("itemlist")) continue;

    const listItems = node.itemListElement;
    if (!Array.isArray(listItems)) continue;

    for (const li of listItems) {
      if (!li || typeof li !== "object") continue;
      const listItem = li as Record<string, unknown>;
      // ListItem may wrap the business under `item`, or be a direct node.
      const bizRaw =
        listItem.item && typeof listItem.item === "object"
          ? (listItem.item as Record<string, unknown>)
          : listItem;
      const payload = extractBizNode(bizRaw);
      if (!payload) continue;
      results.push({
        source: "BBB",
        sourceUrl: searchUrl,
        externalId: payload.bbbUrl || `bbb:${payload.name}`,
        payload,
      });
    }
  }

  if (results.length > 0) return results;

  // ── Path 2: HTML regex fallback ──────────────────────────────────────────
  // BBB business profile paths follow /us/{state}/{city}/{slug} — use that
  // as an anchor to find business links even without JSON-LD.
  // Minimum path length of 5 chars avoids matching bare "/us/x" stubs;
  // maximum name length of 120 chars avoids capturing surrounding markup.
  const BBB_PATH_MIN = 5;
  const BBB_NAME_MAX = 120;
  const seen = new Set<string>();
  const linkRe = new RegExp(
    `<a[^>]+href="(\\/us\\/[^"#?]{${BBB_PATH_MIN},})"[^>]*>([^<]{2,${BBB_NAME_MAX}})<\\/a>`,
    "gi",
  );
  for (const m of html.matchAll(linkRe)) {
    const href = m[1].trim();
    const name = m[2].replace(/\s+/g, " ").trim();
    if (!name || seen.has(href)) continue;
    seen.add(href);
    const bbbUrl = `https://www.bbb.org${href}`;
    results.push({
      source: "BBB",
      sourceUrl: searchUrl,
      externalId: bbbUrl,
      payload: { name, bbbUrl } as BbbPayload,
    });
  }

  return results;
}

export const bbbScraper: Scraper = {
  id: "bbb",
  source: "BBB",
  enabled() {
    return process.env.SCRAPE_BBB === "1";
  },
  async discover(target: ScraperTarget): Promise<DiscoverResult> {
    let url: URL;
    try {
      url = new URL(target.target);
    } catch {
      return { items: [] };
    }
    const host = url.host.toLowerCase().replace(/^www\./, "");
    if (host !== BBB_HOST && !host.endsWith(`.${BBB_HOST}`)) {
      return { items: [] };
    }
    try {
      const res = await politeFetch(url.toString(), { perHostRps: 1 });
      const html = await res.text();
      return { items: parseBbbHtml(html, url.toString()) };
    } catch {
      // Network/robots/rate-limit errors are reported by the runner — never throw.
      return { items: [] };
    }
  },
  normalize(raw: RawBusiness): NormalizedBusiness | null {
    const p = raw.payload as BbbPayload;
    if (!p?.name?.trim()) return null;
    return {
      source: "BBB",
      sourceUrl: raw.sourceUrl,
      externalId: raw.externalId ?? p.bbbUrl,
      name: p.name.trim(),
      phone: p.phone,
      website: p.website,
      address: p.address,
      city: p.city,
      region: p.region,
      postalCode: p.postalCode,
      country: p.country,
      rating: p.rating,
      reviewCount: p.reviewCount,
      category: p.category,
    };
  },
};
