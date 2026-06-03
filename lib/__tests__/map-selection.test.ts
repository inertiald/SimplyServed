import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyMarkerClick, resolveSelectionAfterFilter, type MapSelection } from "../map-selection";
import type { NearbyPlace } from "../discover";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const listingPlace: NearbyPlace = {
  kind: "listing",
  id: "listing-1",
  distanceMiles: 0.3,
  ratingScore: 4.8,
  createdAtMs: Date.now(),
  item: {
    id: "listing-1",
    title: "Dog Walking",
    category: "Pet care",
    hourlyRate: 25,
    lat: 37.775,
    lng: -122.4194,
    createdAt: "2026-06-01T12:00:00.000Z",
    provider: { name: "Pat" },
  },
};

const businessPlace: NearbyPlace = {
  kind: "business",
  id: "biz-1",
  distanceMiles: 0.5,
  ratingScore: 4.5,
  createdAtMs: Date.now(),
  item: {
    id: "biz-1",
    slug: "corner-shop",
    name: "Corner Shop",
    category: "Retail",
    city: "San Francisco",
    region: "CA",
    lat: 37.776,
    lng: -122.42,
    createdAt: "2026-05-30T12:00:00.000Z",
  },
};

const allPlaces: NearbyPlace[] = [listingPlace, businessPlace];

// ---------------------------------------------------------------------------
// applyMarkerClick
// ---------------------------------------------------------------------------

describe("applyMarkerClick", () => {
  it("selects a listing when no previous selection exists", () => {
    const sel: MapSelection = { kind: "listing", id: "listing-1" };
    assert.deepEqual(applyMarkerClick(null, sel), sel);
  });

  it("switches to the newly clicked listing, clearing the old selection", () => {
    const prev: MapSelection = { kind: "listing", id: "listing-old" };
    const next: MapSelection = { kind: "listing", id: "listing-1" };
    assert.deepEqual(applyMarkerClick(prev, next), next);
  });

  it("switches from a business to a listing", () => {
    const prev: MapSelection = { kind: "business", id: "biz-1" };
    const next: MapSelection = { kind: "listing", id: "listing-1" };
    assert.deepEqual(applyMarkerClick(prev, next), next);
  });

  it("selects a business marker", () => {
    const sel: MapSelection = { kind: "business", id: "biz-1" };
    assert.deepEqual(applyMarkerClick(null, sel), sel);
  });

  it("only one marker is selected at a time (previous is replaced)", () => {
    const first: MapSelection = { kind: "listing", id: "listing-1" };
    const second: MapSelection = { kind: "business", id: "biz-1" };
    const result = applyMarkerClick(first, second);
    assert.equal(result?.kind, "business");
    assert.equal(result?.id, "biz-1");
  });
});

// ---------------------------------------------------------------------------
// resolveSelectionAfterFilter
// ---------------------------------------------------------------------------

describe("resolveSelectionAfterFilter", () => {
  it("returns null when no item was selected", () => {
    assert.equal(resolveSelectionAfterFilter(null, allPlaces), null);
  });

  it("keeps a listing selection when it is still visible after filtering", () => {
    const sel: MapSelection = { kind: "listing", id: "listing-1" };
    assert.deepEqual(resolveSelectionAfterFilter(sel, allPlaces), sel);
  });

  it("keeps a business selection when it is still visible after filtering", () => {
    const sel: MapSelection = { kind: "business", id: "biz-1" };
    assert.deepEqual(resolveSelectionAfterFilter(sel, allPlaces), sel);
  });

  it("clears selection when the selected listing is filtered out", () => {
    const sel: MapSelection = { kind: "listing", id: "listing-1" };
    const placesWithoutListing = allPlaces.filter((p) => p.kind !== "listing");
    assert.equal(resolveSelectionAfterFilter(sel, placesWithoutListing), null);
  });

  it("clears selection when the selected business is filtered out", () => {
    const sel: MapSelection = { kind: "business", id: "biz-1" };
    const placesWithoutBusiness = allPlaces.filter((p) => p.kind !== "business");
    assert.equal(resolveSelectionAfterFilter(sel, placesWithoutBusiness), null);
  });

  it("clears selection when the visible list is empty", () => {
    const sel: MapSelection = { kind: "listing", id: "listing-1" };
    assert.equal(resolveSelectionAfterFilter(sel, []), null);
  });

  it("does not clear selection for a different item with the same kind", () => {
    const sel: MapSelection = { kind: "listing", id: "listing-other" };
    assert.equal(resolveSelectionAfterFilter(sel, allPlaces), null);
  });
});
