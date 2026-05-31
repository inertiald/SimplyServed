/**
 * Yelp Fusion API adapter. Only active when `YELP_API_KEY` is set.
 *
 * We deliberately do NOT scrape Yelp's HTML — it's hostile to scraping (CAPTCHA,
 * IP bans, legal exposure) and the official API is both supported and
 * higher-quality. Without a key this adapter cleanly no-ops.
 */
import { politeFetchJson } from "./http";
import type {
  DiscoverResult,
  NormalizedBusiness,
  RawBusiness,
  Scraper,
  ScraperTarget,
} from "./types";

interface YelpBusiness {
  id: string;
  alias: string;
  name: string;
  image_url?: string;
  url: string;
  phone?: string;
  display_phone?: string;
  categories?: { alias: string; title: string }[];
  rating?: number;
  review_count?: number;
  coordinates?: { latitude: number; longitude: number };
  location?: {
    address1?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    country?: string;
  };
}

interface YelpSearchResponse {
  businesses: YelpBusiness[];
  total: number;
}

const ENDPOINT = "https://api.yelp.com/v3/businesses/search";

export const yelpScraper: Scraper = {
  id: "yelp",
  source: "YELP",
  enabled() {
    return Boolean(process.env.YELP_API_KEY);
  },
  async discover(target: ScraperTarget): Promise<DiscoverResult> {
    const key = process.env.YELP_API_KEY;
    if (!key) return { items: [] };
    const offset = ((target.cursor as { offset?: number } | undefined)?.offset ?? 0) | 0;
    const url = `${ENDPOINT}?location=${encodeURIComponent(target.target)}&limit=50&offset=${offset}`;
    const json = await politeFetchJson<YelpSearchResponse>(url, {
      headers: { Authorization: `Bearer ${key}` },
      perHostRps: 2,
    });
    const items: RawBusiness[] = (json.businesses ?? []).map((b) => ({
      source: "YELP",
      sourceUrl: b.url,
      externalId: b.id,
      payload: b,
    }));
    const nextOffset = offset + items.length;
    return {
      items,
      nextCursor: nextOffset < (json.total ?? 0) && items.length > 0 ? { offset: nextOffset } : undefined,
    };
  },
  normalize(raw: RawBusiness): NormalizedBusiness | null {
    const b = raw.payload as YelpBusiness;
    if (!b.name || !b.coordinates) return null;
    return {
      source: "YELP",
      sourceUrl: raw.sourceUrl,
      externalId: b.id,
      name: b.name,
      category: b.categories?.[0]?.title,
      phone: b.phone || b.display_phone,
      website: undefined,
      address: b.location?.address1,
      city: b.location?.city,
      region: b.location?.state,
      postalCode: b.location?.zip_code,
      country: b.location?.country,
      lat: b.coordinates.latitude,
      lng: b.coordinates.longitude,
      rating: b.rating,
      reviewCount: b.review_count,
      tags: b.categories?.map((c) => c.title.toLowerCase()),
      media: b.image_url ? [{ kind: "IMAGE", url: b.image_url }] : undefined,
    };
  },
};
