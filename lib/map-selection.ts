import type { NearbyPlace } from "./discover";

/**
 * Describes which pin is currently selected on the map.
 * Shared between LeafletMap and VibeMap.
 */
export type MapSelection =
  | { kind: "listing"; id: string }
  | { kind: "business"; id: string }
  | null;

/**
 * Returns the new selection produced by clicking a map marker.
 * Map marker clicks always select the clicked item (no toggle); list
 * row clicks toggle and are handled inline in VibeMap.
 */
export function applyMarkerClick(
  _current: MapSelection,
  clicked: MapSelection,
): MapSelection {
  return clicked;
}

/**
 * After the visible-places list changes (e.g. the user adjusts a filter),
 * clear the selection if the previously-selected item is no longer visible.
 */
export function resolveSelectionAfterFilter(
  selection: MapSelection,
  places: NearbyPlace[],
): MapSelection {
  if (!selection) return null;
  const stillVisible = places.some(
    (place) => place.kind === selection.kind && place.id === selection.id,
  );
  return stillVisible ? selection : null;
}
