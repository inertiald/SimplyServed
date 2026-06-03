import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNearbyPlaces,
  DISCOVER_DEFAULT_RADIUS,
  parseDiscoverRadius,
} from "../discover";

const coords = { lat: 37.7749, lng: -122.4194 };

describe("parseDiscoverRadius", () => {
  it("accepts supported radius options", () => {
    assert.equal(parseDiscoverRadius("1"), 1);
    assert.equal(parseDiscoverRadius("25"), 25);
  });

  it("falls back to the default radius for unsupported values", () => {
    assert.equal(parseDiscoverRadius("3"), DISCOVER_DEFAULT_RADIUS);
    assert.equal(parseDiscoverRadius(null), DISCOVER_DEFAULT_RADIUS);
  });
});

describe("buildNearbyPlaces", () => {
  const listings = [
    {
      id: "listing-high",
      title: "Five Star Cleaning",
      category: "Home services",
      hourlyRate: 80,
      lat: 37.775,
      lng: -122.4194,
      createdAt: "2026-06-02T12:00:00.000Z",
      ratingAvg: 4.9,
      ratingCount: 20,
      provider: { name: "Alex" },
    },
    {
      id: "listing-budget",
      title: "Budget Cleaning",
      category: "Home services",
      hourlyRate: 45,
      lat: 37.78,
      lng: -122.42,
      createdAt: "2026-06-01T12:00:00.000Z",
      ratingAvg: 4.5,
      ratingCount: 8,
      provider: { name: "Sam" },
    },
    {
      id: "listing-new",
      title: "New Tutors",
      category: "Tutoring",
      hourlyRate: 60,
      lat: 37.79,
      lng: -122.41,
      createdAt: "2026-06-03T12:00:00.000Z",
      ratingAvg: 4.2,
      ratingCount: 3,
      provider: { name: "Jordan" },
    },
  ];

  const businesses = [
    {
      id: "business-home",
      slug: "sparkle-shop",
      name: "Sparkle Shop",
      category: "Home services",
      city: "San Francisco",
      region: "CA",
      lat: 37.77495,
      lng: -122.41945,
      createdAt: "2026-05-30T12:00:00.000Z",
      ratingAvg: 4.8,
      ratingCount: 50,
    },
    {
      id: "business-food",
      slug: "late-night-bites",
      name: "Late Night Bites",
      category: "Food & catering",
      city: "San Francisco",
      region: "CA",
      lat: 37.804,
      lng: -122.2711,
      createdAt: "2026-06-03T13:00:00.000Z",
      ratingAvg: 4.1,
      ratingCount: 12,
    },
  ];

  it("filters by category and max rate together", () => {
    const places = buildNearbyPlaces({
      listings,
      businesses,
      coords,
      category: "Home services",
      maxRate: 50,
      sort: "highest-rated",
    });

    assert.deepEqual(
      places.map((place) => place.id),
      ["business-home", "listing-budget"],
    );
  });

  it("sorts by newest across listings and businesses", () => {
    const places = buildNearbyPlaces({
      listings,
      businesses,
      coords,
      sort: "newest",
    });

    assert.deepEqual(
      places.map((place) => place.id).slice(0, 3),
      ["business-food", "listing-new", "listing-high"],
    );
  });

  it("sorts by closest when requested", () => {
    const places = buildNearbyPlaces({
      listings,
      businesses,
      coords,
      sort: "closest",
    });

    assert.equal(places[0]?.id, "business-home");
    assert.equal(places[1]?.id, "listing-high");
  });
});
