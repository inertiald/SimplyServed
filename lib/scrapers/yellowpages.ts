/**
 * YellowPages directory adapter.
 *
 * Targets are YellowPages search URLs, e.g.:
 *   https://www.yellowpages.com/search?search_terms=plumber&geo_location_terms=Seattle%2C+WA
 *
 * Discovery parses the HTML search-results page, splitting on
 * `data-listing-id` attributes so each YP result card becomes one
 * `RawBusiness` item. Within each card the adapter reads:
 *   - `.business-name`  anchor  → name + YP listing URL
 *   - `.phones`         div/a   → primary phone
 *   - `.street-address` span    → street
 *   - `.locality`       span    → city
 *   - `.region`         span    → state/region
 *   - `.zip`            span    → postal code
 *   - `.business-website` anchor → external website
 *   - `.snippet`        p       → description
 *
 * Gated on SCRAPE_YELLOWPAGES=1. Targets are restricted to yellowpages.com.
 * All HTTP calls go through `politeFetch` (robots.txt + rate limits honoured).
 */
import { politeFetch } from "./http";
import type {
  DiscoverResult,
  NormalizedBusiness,
  RawBusiness,
  Scraper,
  ScraperTarget,
} from "./types";

const YP_HOST = "yellowpages.com";

interface YpPayload {
  listingId: string;
  name: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  description?: string;
  ypUrl: string;
}

/** Strip all HTML tags and collapse whitespace to a plain-text string.
 *
 * Removes `<script>` and `<style>` blocks (including their content) before
 * stripping remaining tags so that inline scripts or stylesheets never leak
 * into the extracted text. The `<[^>]+>` pattern is sufficient for the
 * well-formed HTML fragments produced by YellowPages result cards; any
 * remaining `<` / `>` characters will be escaped by React before rendering.
 */
function innerText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Minimalistic CSS-selector lookup: supports `tag.className` patterns.
 * Returns the raw inner HTML of the first matching element, or undefined.
 * (Same simplification as the chamber adapter's `pick` helper.)
 */
function first(html: string, selector: string): string | undefined {
  const dotIdx = selector.indexOf(".");
  const tag = dotIdx >= 0 ? selector.slice(0, dotIdx) : selector;
  const cls = dotIdx >= 0 ? selector.slice(dotIdx + 1) : undefined;
  const re = cls
    ? new RegExp(
        `<${tag}[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`,
        "i",
      )
    : new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m ? m[1] : undefined;
}

/** Extract the value of a named HTML attribute from a tag snippet. */
function attrVal(tagHtml: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}=["']([^"']+)["']`, "i");
  const m = tagHtml.match(re);
  return m ? m[1].trim() : undefined;
}

function parseYpBlock(block: string, listingId: string): YpPayload | null {
  // ── Business name + YP URL ────────────────────────────────────────────────
  const nameAnchorM = block.match(
    /<a[^>]*class="[^"]*\bbusiness-name\b[^"]*"([^>]*)>([^<]+)<\/a>/i,
  );
  if (!nameAnchorM) return null;
  const name = nameAnchorM[2].replace(/\s+/g, " ").trim();
  if (!name) return null;
  const ypPath = attrVal(`<a${nameAnchorM[1]}>`, "href") ?? "";
  const ypUrl = ypPath.startsWith("http")
    ? ypPath
    : `https://www.yellowpages.com${ypPath}`;

  // ── Phone ─────────────────────────────────────────────────────────────────
  const phoneBlock = first(block, "div.phones");
  const phone = phoneBlock ? innerText(phoneBlock) || undefined : undefined;

  // ── Address components ────────────────────────────────────────────────────
  const streetBlock = first(block, "span.street-address");
  const localityBlock = first(block, "span.locality");
  const regionBlock = first(block, "span.region");
  const zipBlock = first(block, "span.zip");
  const address = streetBlock ? innerText(streetBlock) || undefined : undefined;
  const city = localityBlock ? innerText(localityBlock) || undefined : undefined;
  const region = regionBlock ? innerText(regionBlock) || undefined : undefined;
  const postalCode = zipBlock ? innerText(zipBlock) || undefined : undefined;

  // ── External website ──────────────────────────────────────────────────────
  const websiteM = block.match(
    /<a[^>]*class="[^"]*\bbusiness-website\b[^"]*"[^>]*href="([^"]+)"/i,
  );
  const website = websiteM ? websiteM[1].trim() : undefined;

  // ── Snippet / description ─────────────────────────────────────────────────
  const snippetBlock = first(block, "p.snippet");
  const description = snippetBlock ? innerText(snippetBlock) || undefined : undefined;

  return {
    listingId,
    name,
    phone,
    website,
    address,
    city,
    region,
    postalCode,
    description,
    ypUrl,
  };
}

/**
 * Parse a YellowPages search-results HTML page into raw business items.
 *
 * Exported so tests can call it directly against fixture HTML without
 * touching the network.
 */
export function parseYpHtml(html: string, searchUrl: string): RawBusiness[] {
  const results: RawBusiness[] = [];

  // Split the page at every occurrence of a result block opener. Each segment
  // from split index 1 onwards begins with the data-listing-id value and
  // contains the remainder of that listing card.
  const segments = html.split(/(?=<div[^>]*\bdata-listing-id=")/);

  for (const seg of segments) {
    const idM = seg.match(/\bdata-listing-id="(\d+)"/);
    if (!idM) continue;
    const listingId = idM[1];
    const payload = parseYpBlock(seg, listingId);
    if (!payload) continue;
    results.push({
      source: "YELLOWPAGES",
      sourceUrl: searchUrl,
      externalId: listingId,
      payload,
    });
  }

  return results;
}

export const yellowPagesScraper: Scraper = {
  id: "yellowpages",
  source: "YELLOWPAGES",
  enabled() {
    return process.env.SCRAPE_YELLOWPAGES === "1";
  },
  async discover(target: ScraperTarget): Promise<DiscoverResult> {
    let url: URL;
    try {
      url = new URL(target.target);
    } catch {
      return { items: [] };
    }
    const host = url.host.toLowerCase().replace(/^www\./, "");
    if (host !== YP_HOST && !host.endsWith(`.${YP_HOST}`)) {
      return { items: [] };
    }
    try {
      const res = await politeFetch(url.toString(), { perHostRps: 1 });
      const html = await res.text();
      return { items: parseYpHtml(html, url.toString()) };
    } catch {
      // Network/robots/rate-limit errors are reported by the runner — never throw.
      return { items: [] };
    }
  },
  normalize(raw: RawBusiness): NormalizedBusiness | null {
    const p = raw.payload as YpPayload;
    if (!p?.name?.trim()) return null;
    return {
      source: "YELLOWPAGES",
      sourceUrl: raw.sourceUrl,
      externalId: raw.externalId ?? p.listingId,
      name: p.name.trim(),
      phone: p.phone,
      website: p.website,
      address: p.address,
      city: p.city,
      region: p.region,
      postalCode: p.postalCode,
      description: p.description,
    };
  },
};
