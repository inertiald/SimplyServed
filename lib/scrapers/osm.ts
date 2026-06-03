/**
 * OpenStreetMap (Overpass API) adapter.
 *
 * OSM is the only source we ship with full ingestion enabled out-of-the-box:
 *   - no API key required,
 *   - permissive ODbL license,
 *   - genuinely good coverage of small + chamber-of-commerce-tier businesses.
 *
 * Targets are city slugs from `data/osm-targets.json` (a curated bbox list).
 * Each Overpass query asks for nodes tagged `amenity` / `shop` / `office`
 * with a `name`, and we treat each result as a candidate business.
 *
 * NB: we deliberately don't paginate against Overpass — its server side
 * implements query timeouts. We pick small bboxes (city-sized) and run them
 * as separate `ScrapeJob`s.
 */
import overpassTargets from "@/data/osm-targets.json";
import { politeFetchJson } from "./http";
import type {
  DiscoverResult,
  NormalizedBusiness,
  RawBusiness,
  Scraper,
  ScraperTarget,
} from "./types";

interface OverpassNode {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassNode[];
}

interface OverpassTarget {
  slug: string;
  bbox: [number, number, number, number]; // south, west, north, east
}

const OVERPASS_ENDPOINT =
  process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

function buildQuery(bbox: [number, number, number, number]): string {
  const [s, w, n, e] = bbox;
  // Limit to elements that look like businesses with a public-facing name.
  return `
[out:json][timeout:60];
(
  node["name"]["amenity"](${s},${w},${n},${e});
  node["name"]["shop"](${s},${w},${n},${e});
  node["name"]["office"](${s},${w},${n},${e});
  node["name"]["craft"](${s},${w},${n},${e});
);
out body 500;
`.trim();
}

function findTarget(slug: string): OverpassTarget | null {
  const list = overpassTargets as OverpassTarget[];
  return list.find((t) => t.slug === slug) ?? null;
}

export const osmScraper: Scraper = {
  id: "osm",
  source: "OPENSTREETMAP",
  enabled() {
    return true;
  },
  async discover(target: ScraperTarget): Promise<DiscoverResult> {
    const tgt = findTarget(target.target);
    if (!tgt) return { items: [] };
    const body = `data=${encodeURIComponent(buildQuery(tgt.bbox))}`;
    const json = await politeFetchJson<OverpassResponse>(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      perHostRps: 1,
    });
    const items: RawBusiness[] = (json.elements ?? []).map((el) => ({
      source: "OPENSTREETMAP",
      sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      externalId: `${el.type}/${el.id}`,
      payload: el,
    }));
    return { items };
  },
  normalize(raw: RawBusiness): NormalizedBusiness | null {
    const el = raw.payload as OverpassNode;
    const tags = el.tags ?? {};
    const name = tags.name;
    if (!name) return null;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") return null;

    const category = tags.amenity ?? tags.shop ?? tags.office ?? tags.craft;
    const social: Record<string, string> = {};
    if (tags["contact:facebook"]) social.facebook = tags["contact:facebook"];
    if (tags["contact:instagram"]) social.instagram = tags["contact:instagram"];
    if (tags["contact:twitter"]) social.twitter = tags["contact:twitter"];

    return {
      source: "OPENSTREETMAP",
      sourceUrl: raw.sourceUrl,
      externalId: raw.externalId,
      name,
      description: tags.description,
      category,
      phone: tags.phone ?? tags["contact:phone"],
      email: tags.email ?? tags["contact:email"],
      website: tags.website ?? tags["contact:website"],
      address: [tags["addr:housenumber"], tags["addr:street"]]
        .filter(Boolean)
        .join(" ") || undefined,
      city: tags["addr:city"],
      region: tags["addr:state"],
      postalCode: tags["addr:postcode"],
      country: tags["addr:country"],
      lat,
      lng,
      hours: tags.opening_hours ? { raw: tags.opening_hours } : undefined,
      socialLinks: Object.keys(social).length > 0 ? social : undefined,
      tags: category ? [category] : undefined,
    };
  },
};
