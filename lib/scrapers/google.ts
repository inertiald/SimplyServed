/**
 * Google Places API adapter. Only active when `GOOGLE_PLACES_API_KEY` is set.
 *
 * Same policy as Yelp: we use the official API or skip entirely. Bypassing
 * Google's bot defenses is fragile and against ToS.
 */
import { politeFetchJson } from "./http";
import type {
  DiscoverResult,
  NormalizedBusiness,
  RawBusiness,
  Scraper,
  ScraperTarget,
} from "./types";

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  types?: string[];
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  addressComponents?: Array<{
    longText: string;
    types: string[];
  }>;
}

interface GoogleSearchResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryType,places.types,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.addressComponents,nextPageToken";

function componentOf(place: GooglePlace, type: string): string | undefined {
  return place.addressComponents?.find((c) => c.types.includes(type))?.longText;
}

export const googleScraper: Scraper = {
  id: "google",
  source: "GOOGLE",
  enabled() {
    return Boolean(process.env.GOOGLE_PLACES_API_KEY);
  },
  async discover(target: ScraperTarget): Promise<DiscoverResult> {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) return { items: [] };
    const cursor = target.cursor as { pageToken?: string } | undefined;
    const json = await politeFetchJson<GoogleSearchResponse>(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: target.target,
        pageToken: cursor?.pageToken,
      }),
      perHostRps: 2,
    });
    const items: RawBusiness[] = (json.places ?? []).map((p) => ({
      source: "GOOGLE",
      sourceUrl: p.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${p.id}`,
      externalId: p.id,
      payload: p,
    }));
    return {
      items,
      nextCursor: json.nextPageToken ? { pageToken: json.nextPageToken } : undefined,
    };
  },
  normalize(raw: RawBusiness): NormalizedBusiness | null {
    const p = raw.payload as GooglePlace;
    if (!p.displayName?.text || !p.location) return null;
    return {
      source: "GOOGLE",
      sourceUrl: raw.sourceUrl,
      externalId: p.id,
      name: p.displayName.text,
      category: p.primaryType,
      phone: p.internationalPhoneNumber,
      website: p.websiteUri,
      address: p.formattedAddress,
      city: componentOf(p, "locality"),
      region: componentOf(p, "administrative_area_level_1"),
      postalCode: componentOf(p, "postal_code"),
      country: componentOf(p, "country"),
      lat: p.location.latitude,
      lng: p.location.longitude,
      rating: p.rating,
      reviewCount: p.userRatingCount,
      tags: p.types,
    };
  },
};
