/**
 * Public OG-metadata enrichment for social URLs already discovered on a
 * `BusinessProfile`.
 *
 * We do NOT scrape private content, post bodies, photos, or anything that
 * would violate Facebook/Instagram ToS. We only fetch the public profile
 * page and extract <meta property="og:*"> tags — exactly what Facebook
 * themselves expose to any browser.
 */
import { politeFetch } from "./http";
import type {
  DiscoverResult,
  NormalizedBusiness,
  RawBusiness,
  Scraper,
  ScraperTarget,
} from "./types";

interface SocialPayload {
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  url: string;
  platform: "FACEBOOK" | "INSTAGRAM" | "OTHER";
}

function platformOf(host: string): SocialPayload["platform"] {
  if (host.endsWith("facebook.com")) return "FACEBOOK";
  if (host.endsWith("instagram.com")) return "INSTAGRAM";
  return "OTHER";
}

function extractMeta(html: string, prop: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  return m?.[1];
}

export const socialScraper: Scraper = {
  id: "social",
  source: "OTHER",
  enabled() {
    // Gated on env so the runner doesn't surprise-hit social sites by default.
    return process.env.SCRAPE_SOCIAL_OG === "1";
  },
  async discover(target: ScraperTarget): Promise<DiscoverResult> {
    // `target.target` is a URL.
    const url = target.target;
    try {
      const u = new URL(url);
      const res = await politeFetch(url, { perHostRps: 1 });
      const html = await res.text();
      const platform = platformOf(u.host);
      const payload: SocialPayload = {
        url,
        platform,
        ogTitle: extractMeta(html, "og:title"),
        ogDescription: extractMeta(html, "og:description"),
        ogImage: extractMeta(html, "og:image"),
      };
      return {
        items: [
          {
            source: platform === "OTHER" ? "OTHER" : platform,
            sourceUrl: url,
            externalId: url,
            payload,
          },
        ],
      };
    } catch {
      return { items: [] };
    }
  },
  normalize(raw: RawBusiness): NormalizedBusiness | null {
    const p = raw.payload as SocialPayload;
    if (!p.ogTitle) return null;
    return {
      source: raw.source,
      sourceUrl: raw.sourceUrl ?? p.url,
      externalId: p.url,
      name: p.ogTitle,
      description: p.ogDescription,
      website: p.url,
      media: p.ogImage ? [{ kind: "IMAGE", url: p.ogImage }] : undefined,
    };
  },
};
