export const DISCOVER_RADIUS_OPTIONS = [1, 5, 10, 25] as const;

export type DiscoverRingMiles = (typeof DISCOVER_RADIUS_OPTIONS)[number];
export type DiscoverSort = "highest-rated" | "newest" | "closest";

export const DISCOVER_DEFAULT_RADIUS: DiscoverRingMiles = 5;
export const DISCOVER_DEFAULT_SORT: DiscoverSort = "highest-rated";
export const DISCOVER_FEED_RING_BY_RADIUS: Record<DiscoverRingMiles, number> = {
  1: 1,
  5: 2,
  10: 3,
  25: 4,
};

export interface DiscoverListingLike {
  id: string;
  title: string;
  category: string;
  hourlyRate: number;
  lat: number;
  lng: number;
  createdAt: string | Date;
  ratingAvg?: number;
  ratingCount?: number;
  provider: { name: string };
}

export interface DiscoverBusinessLike {
  id: string;
  slug: string;
  name: string;
  category?: string | null;
  city?: string | null;
  region?: string | null;
  lat: number;
  lng: number;
  createdAt: string | Date;
  ratingAvg?: number;
  ratingCount?: number;
}

export type NearbyPlace =
  | { kind: "listing"; id: string; distanceMiles: number; ratingScore: number; createdAtMs: number; item: DiscoverListingLike }
  | { kind: "business"; id: string; distanceMiles: number; ratingScore: number; createdAtMs: number; item: DiscoverBusinessLike };

export function parseDiscoverRadius(value: string | null | undefined): DiscoverRingMiles {
  const numeric = Number(value);
  return DISCOVER_RADIUS_OPTIONS.includes(numeric as DiscoverRingMiles)
    ? (numeric as DiscoverRingMiles)
    : DISCOVER_DEFAULT_RADIUS;
}

export function parseDiscoverSort(value: string | null | undefined): DiscoverSort {
  return value === "newest" || value === "closest" || value === "highest-rated"
    ? value
    : DISCOVER_DEFAULT_SORT;
}

export function haversineMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

export function buildNearbyPlaces({
  listings,
  businesses,
  coords,
  category,
  maxRate,
  sort,
}: {
  listings: DiscoverListingLike[];
  businesses: DiscoverBusinessLike[];
  coords: { lat: number; lng: number };
  category?: string;
  maxRate?: number | null;
  sort: DiscoverSort;
}): NearbyPlace[] {
  const normalizedCategory = category?.trim();
  const places: NearbyPlace[] = [
    ...listings
      .filter((listing) => {
        if (normalizedCategory && listing.category !== normalizedCategory) return false;
        if (typeof maxRate === "number" && Number.isFinite(maxRate) && listing.hourlyRate > maxRate) {
          return false;
        }
        return true;
      })
      .map((listing) => ({
        kind: "listing" as const,
        id: listing.id,
        distanceMiles: haversineMiles(coords, listing),
        ratingScore: listing.ratingAvg ?? 0,
        createdAtMs: new Date(listing.createdAt).getTime(),
        item: listing,
      })),
    ...businesses
      .filter((business) => !normalizedCategory || business.category === normalizedCategory)
      .map((business) => ({
        kind: "business" as const,
        id: business.id,
        distanceMiles: haversineMiles(coords, business),
        ratingScore: business.ratingAvg ?? 0,
        createdAtMs: new Date(business.createdAt).getTime(),
        item: business,
      })),
  ];

  return places.sort((left, right) => {
    if (sort === "closest") {
      return (
        left.distanceMiles - right.distanceMiles ||
        right.ratingScore - left.ratingScore ||
        right.createdAtMs - left.createdAtMs
      );
    }
    if (sort === "newest") {
      return (
        right.createdAtMs - left.createdAtMs ||
        right.ratingScore - left.ratingScore ||
        left.distanceMiles - right.distanceMiles
      );
    }
    return (
      right.ratingScore - left.ratingScore ||
      ((right.item.ratingCount ?? 0) - (left.item.ratingCount ?? 0)) ||
      left.distanceMiles - right.distanceMiles ||
      right.createdAtMs - left.createdAtMs
    );
  });
}
