import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOfferExpiresAt, isOfferExpired, isOfferMetadataExpired } from "../offers";

describe("getOfferExpiresAt", () => {
  it("reads metadata.offer.expiresAt", () => {
    assert.equal(getOfferExpiresAt({ offer: { code: "SAVE20", discount: "20%", expiresAt: "2026-06-01" } }), "2026-06-01");
  });

  it("returns null for non-offer metadata", () => {
    assert.equal(getOfferExpiresAt({}), null);
    assert.equal(getOfferExpiresAt({ offer: {} }), null);
    assert.equal(getOfferExpiresAt(null), null);
  });
});

describe("isOfferExpired", () => {
  const now = new Date("2026-06-03T12:00:00.000Z");

  it("supports date-only expiries", () => {
    assert.equal(isOfferExpired("2026-06-02", now), true);
    assert.equal(isOfferExpired("2026-06-03", now), false);
  });

  it("supports ISO timestamp expiries", () => {
    assert.equal(isOfferExpired("2026-06-03T11:59:59.000Z", now), true);
    assert.equal(isOfferExpired("2026-06-03T12:00:01.000Z", now), false);
  });

  it("falls back to Date.parse for non-ISO strings", () => {
    assert.equal(isOfferExpired("Wed, 03 Jun 2026 11:00:00 GMT", now), true);
  });

  it("fails closed on invalid dates", () => {
    assert.equal(isOfferExpired("not-a-date", now), false);
  });
});

describe("isOfferMetadataExpired", () => {
  const now = new Date("2026-06-03T12:00:00.000Z");

  it("combines metadata extraction + expiry check", () => {
    assert.equal(isOfferMetadataExpired({ offer: { expiresAt: "2026-06-02" } }, now), true);
    assert.equal(isOfferMetadataExpired({ offer: { expiresAt: "2026-06-04" } }, now), false);
  });
});
