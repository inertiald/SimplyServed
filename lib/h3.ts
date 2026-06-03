import { latLngToCell, cellToLatLng, cellToBoundary, gridDisk } from "h3-js";

/** City-level resolution (~5km hex edge). */
export const RES_CITY = 7;
/** Neighborhood-level resolution (~175m hex edge). */
export const RES_NEIGHBORHOOD = 9;

export interface H3Coords {
  lat: number;
  lng: number;
  h3City: string;
  h3Neighborhood: string;
}

export function indexCoords(lat: number, lng: number): H3Coords {
  return {
    lat,
    lng,
    h3City: latLngToCell(lat, lng, RES_CITY),
    h3Neighborhood: latLngToCell(lat, lng, RES_NEIGHBORHOOD),
  };
}

export function neighborhoodCellsAround(
  lat: number,
  lng: number,
  ringSize = 1,
): string[] {
  return gridDisk(latLngToCell(lat, lng, RES_NEIGHBORHOOD), ringSize);
}

export function cellCenter(cell: string): { lat: number; lng: number } {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}

export function cellPolygon(cell: string): [number, number][] {
  // [lat, lng] pairs, closed ring.
  return cellToBoundary(cell);
}
