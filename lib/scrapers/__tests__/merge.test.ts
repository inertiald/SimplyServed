/**
 * Tests for the dedup/merge module.
 *
 * Runs under node's built-in test runner (no extra dep needed):
 *
 *   node --import tsx --test lib/scrapers/__tests__/merge.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeDedupeKey,
  haversineMeters,
  matchConfidence,
  mergeProfiles,
  nameSimilarity,
  normalizeName,
  normalizePhone,
  pickField,
  rejectIfGarbage,
  MERGE_AUTO_THRESHOLD,
  MERGE_REVIEW_THRESHOLD,
} from "../merge";
import type { NormalizedBusiness } from "../types";

describe("normalizeName", () => {
  it("strips punctuation, diacritics, business suffixes", () => {
    assert.equal(normalizeName("The Café Olé, LLC."), "cafe ole");
    assert.equal(normalizeName("Joe's Pizza Inc"), "joes pizza");
    assert.equal(normalizeName("AT&T Mobility"), "at and t mobility");
  });
});

describe("normalizePhone", () => {
  it("digits-only, NANP defaults to +1", () => {
    assert.equal(normalizePhone("(415) 555-1212"), "14155551212");
    assert.equal(normalizePhone("+44 20 7946 0958"), "442079460958");
    assert.equal(normalizePhone(""), "");
    assert.equal(normalizePhone(null), "");
    assert.equal(normalizePhone(undefined), "");
  });
});

describe("computeDedupeKey", () => {
  it("collides on equivalent name + phone + nearby geo", () => {
    const a = computeDedupeKey({
      name: "Joe's Pizza",
      phone: "(415) 555-1212",
      lat: 37.7649,
      lng: -122.4194,
    });
    const b = computeDedupeKey({
      name: "JOES PIZZA",
      phone: "+1 415 555 1212",
      lat: 37.7649,
      lng: -122.4194,
    });
    assert.equal(a, b);
  });
  it("does not collide on different businesses", () => {
    const a = computeDedupeKey({ name: "Joe's Pizza", phone: "415-555-1212", lat: 37.76, lng: -122.41 });
    const b = computeDedupeKey({ name: "Steve's Tacos", phone: "415-555-9999", lat: 37.76, lng: -122.41 });
    assert.notEqual(a, b);
  });
});

describe("rejectIfGarbage", () => {
  const base: NormalizedBusiness = {
    source: "OPENSTREETMAP",
    sourceUrl: "https://example.com/1",
    name: "Joe's Pizza",
    lat: 37.76,
    lng: -122.41,
  };
  it("accepts a clean record", () => {
    assert.equal(rejectIfGarbage(base), null);
  });
  it("rejects missing name", () => {
    assert.equal(rejectIfGarbage({ ...base, name: "" })?.reason, "missing-name");
  });
  it("rejects stop-list names", () => {
    assert.match(rejectIfGarbage({ ...base, name: "test" })?.reason ?? "", /stop-list/);
  });
  it("rejects 0,0 sentinel coords", () => {
    assert.equal(rejectIfGarbage({ ...base, lat: 0, lng: 0 })?.reason, "invalid-geo");
  });
  it("rejects binary descriptions", () => {
    assert.equal(
      rejectIfGarbage({ ...base, description: "hello\x00world" })?.reason,
      "description-binary",
    );
  });
});

describe("pickField — source priority", () => {
  it("prefers GOOGLE over OPENSTREETMAP", () => {
    const v = pickField<string>([
      { value: "OSM Name", source: "OPENSTREETMAP" },
      { value: "Google Name", source: "GOOGLE" },
    ]);
    assert.equal(v, "Google Name");
  });
  it("falls back to the next non-empty source", () => {
    const v = pickField<string>([
      { value: "", source: "GOOGLE" },
      { value: "OSM", source: "OPENSTREETMAP" },
    ]);
    assert.equal(v, "OSM");
  });
});

describe("mergeProfiles", () => {
  const google: NormalizedBusiness = {
    source: "GOOGLE",
    sourceUrl: "https://g/1",
    name: "Joe's Pizza",
    description: "Best slice in town.",
    rating: 4.6,
    reviewCount: 200,
    lat: 37.76,
    lng: -122.41,
  };
  const osm: NormalizedBusiness = {
    source: "OPENSTREETMAP",
    sourceUrl: "https://osm/1",
    name: "Joes Pizza",
    description: "Slices and pies.",
    rating: 4.2,
    reviewCount: 50,
    tags: ["restaurant"],
    lat: 37.76,
    lng: -122.41,
  };

  it("picks higher-priority description but unions tags", () => {
    const merged = mergeProfiles([google, osm]);
    assert.equal(merged.description, "Best slice in town.");
    assert.deepEqual(merged.tags, ["restaurant"]);
  });
  it("weights ratings by review count", () => {
    const merged = mergeProfiles([google, osm]);
    // (4.6 * 200 + 4.2 * 50) / 250 = 4.52
    assert.equal(Math.round(merged.ratingAvg * 100) / 100, 4.52);
    assert.equal(merged.ratingCount, 250);
  });
  it("respects ownerOverrides", () => {
    const merged = mergeProfiles([google, osm], { description: true });
    assert.equal(merged.description, undefined);
  });
});

describe("nameSimilarity + matchConfidence", () => {
  it("identical name + phone is high confidence", () => {
    const c = matchConfidence(
      { name: "Joe's Pizza", phone: "415-555-1212", lat: 37.76, lng: -122.41 },
      { name: "Joes Pizza", phone: "+1 (415) 555-1212", lat: 37.7601, lng: -122.4101 },
    );
    assert.ok(c >= MERGE_AUTO_THRESHOLD, `expected ≥${MERGE_AUTO_THRESHOLD}, got ${c}`);
  });
  it("similar name + close geo is auto-merge", () => {
    const c = matchConfidence(
      { name: "Joe Pizza Shop", lat: 37.76, lng: -122.41 },
      { name: "Joe Pizza Shop", lat: 37.7601, lng: -122.4101 },
    );
    assert.ok(c >= MERGE_AUTO_THRESHOLD);
  });
  it("distinct businesses are low confidence", () => {
    const c = matchConfidence(
      { name: "Joe's Pizza", lat: 37.76, lng: -122.41 },
      { name: "Steve's Tacos", lat: 37.79, lng: -122.39 },
    );
    assert.ok(c < MERGE_REVIEW_THRESHOLD, `got ${c}`);
  });
  it("phone match with weak name match still merges", () => {
    const c = matchConfidence(
      { name: "Joe Pizza Shop", phone: "415-555-1212" },
      { name: "Joe Pizza", phone: "+1 (415) 555-1212" },
    );
    // name sim {joe,pizza,shop} vs {joe,pizza} = 2/3 ≈ 0.67 ≥ 0.6 → 0.95
    assert.ok(c >= MERGE_AUTO_THRESHOLD, `got ${c}`);
  });
});

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    assert.equal(haversineMeters({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
  });
  it("≈111km for one degree of latitude", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    assert.ok(Math.abs(d - 111_000) < 1500, `got ${d}`);
  });
});

describe("nameSimilarity", () => {
  it("1 for identical tokens", () => {
    assert.equal(nameSimilarity("joes pizza", "joes pizza"), 1);
  });
  it("0 for disjoint tokens", () => {
    assert.equal(nameSimilarity("abc", "xyz"), 0);
  });
});
