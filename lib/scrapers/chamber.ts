/**
 * Chamber-of-commerce directory adapter.
 *
 * Most chambers publish their member directories as static HTML with
 * predictable selectors (member name, phone, address, website). Instead of
 * hard-coding 500 different scrapers, we ship a single generic CSS-selector
 * adapter driven by per-site config in `data/chambers.json`.
 *
 * Add a new chamber → add a JSON entry. No code change needed.
 *
 * NB: this is gated on `SCRAPE_CHAMBERS=1` so it never runs by accident.
 * Always respect each chamber's robots.txt (the HTTP layer enforces this).
 */
import chamberConfigs from "@/data/chambers.json";
import { politeFetch } from "./http";
import type {
  DiscoverResult,
  NormalizedBusiness,
  RawBusiness,
  Scraper,
  ScraperTarget,
} from "./types";

interface ChamberConfig {
  slug: string;
  name: string;
  directoryUrl: string;
  selectors: {
    item: string;
    name: string;
    phone?: string;
    website?: string;
    address?: string;
  };
}

interface ChamberPayload {
  configSlug: string;
  name: string;
  phone?: string;
  website?: string;
  address?: string;
}

function pick(html: string, selector: string | undefined): string | undefined {
  if (!selector) return undefined;
  // Extremely simple "selector" support: only `tag.class` patterns. Avoids
  // pulling in a full HTML parser; chamber pages are intentionally simple.
  const [tag, cls] = selector.split(".");
  const re = cls
    ? new RegExp(`<${tag}[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)</${tag}>`, "i")
    : new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = html.match(re);
  if (!m) return undefined;
  return m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || undefined;
}

export const chamberScraper: Scraper = {
  id: "chamber",
  source: "CHAMBER",
  enabled() {
    return process.env.SCRAPE_CHAMBERS === "1" && (chamberConfigs as unknown[]).length > 0;
  },
  async discover(target: ScraperTarget): Promise<DiscoverResult> {
    const cfg = (chamberConfigs as ChamberConfig[]).find((c) => c.slug === target.target);
    if (!cfg) return { items: [] };
    const res = await politeFetch(cfg.directoryUrl, { perHostRps: 1 });
    const html = await res.text();
    const items: RawBusiness[] = [];
    // Split by item selector. Same simplification as `pick`.
    const [tag, cls] = cfg.selectors.item.split(".");
    const blockRe = cls
      ? new RegExp(`<${tag}[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)</${tag}>`, "gi")
      : new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
    for (const m of html.matchAll(blockRe)) {
      const block = m[1];
      const name = pick(block, cfg.selectors.name);
      if (!name) continue;
      const payload: ChamberPayload = {
        configSlug: cfg.slug,
        name,
        phone: pick(block, cfg.selectors.phone),
        website: pick(block, cfg.selectors.website),
        address: pick(block, cfg.selectors.address),
      };
      items.push({
        source: "CHAMBER",
        sourceUrl: cfg.directoryUrl,
        externalId: `${cfg.slug}:${name}`,
        payload,
      });
    }
    return { items };
  },
  normalize(raw: RawBusiness): NormalizedBusiness | null {
    const p = raw.payload as ChamberPayload;
    if (!p.name) return null;
    return {
      source: "CHAMBER",
      sourceUrl: raw.sourceUrl,
      externalId: raw.externalId,
      name: p.name,
      phone: p.phone,
      website: p.website,
      address: p.address,
    };
  },
};
