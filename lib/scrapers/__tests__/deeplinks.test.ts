/**
 * Tests for the channel deep-link builder.
 *
 *   node --import tsx --test lib/scrapers/__tests__/deeplinks.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildChannelLink,
  channelFromUrl,
  channelMeta,
} from "../../deeplinks";

describe("buildChannelLink", () => {
  it("derives a DoorDash app deep link from a store URL", () => {
    const link = buildChannelLink(
      "DOORDASH",
      "https://www.doordash.com/store/joes-pizza-12345/",
    );
    assert.equal(link.appUrl, "doordash://store/joes-pizza-12345");
    assert.equal(link.webUrl, "https://www.doordash.com/store/joes-pizza-12345/");
    assert.equal(link.action, "Order");
    assert.equal(link.label, "DoorDash");
  });

  it("derives an Angi deep link from a numeric pro id", () => {
    const link = buildChannelLink(
      "ANGI",
      "https://www.angi.com/companylist/us/ca/sf/acme-plumbing-987654.htm",
    );
    assert.equal(link.appUrl, "angi://serviceProvider/987654");
  });

  it("falls back to the web URL when no id is derivable", () => {
    const link = buildChannelLink("DOORDASH", "https://www.doordash.com/");
    assert.equal(link.appUrl, "https://www.doordash.com/");
    assert.equal(link.webUrl, "https://www.doordash.com/");
  });

  it("treats DIRECT website links as plain web links", () => {
    const link = buildChannelLink("DIRECT", "https://acme-plumbing.example/book");
    assert.equal(link.appUrl, "https://acme-plumbing.example/book");
    assert.equal(link.action, "Visit");
    assert.equal(link.label, "Website");
  });

  it("returns empty urls for a missing link", () => {
    const link = buildChannelLink("DOORDASH", null);
    assert.equal(link.appUrl, "");
    assert.equal(link.webUrl, "");
    assert.equal(link.label, "DoorDash");
  });

  it("rejects non-http(s) schemes (no javascript: injection)", () => {
    const link = buildChannelLink("DIRECT", "javascript:alert(1)");
    assert.equal(link.appUrl, "");
    assert.equal(link.webUrl, "");
  });
});

describe("channelFromUrl", () => {
  it("maps known hosts to channels", () => {
    assert.equal(channelFromUrl("https://www.doordash.com/store/x-1"), "DOORDASH");
    assert.equal(channelFromUrl("https://order.ubereats.com/store/y-2"), "UBEREATS");
    assert.equal(channelFromUrl("https://www.angieslist.com/pro/z-3"), "ANGI");
  });

  it("treats unknown hosts as the company's own site (DIRECT)", () => {
    assert.equal(channelFromUrl("https://acme-plumbing.example"), "DIRECT");
  });

  it("returns null for an unparseable URL", () => {
    assert.equal(channelFromUrl("not a url"), null);
  });
});

describe("channelMeta", () => {
  it("exposes label + action without a URL", () => {
    assert.deepEqual(channelMeta("THUMBTACK"), { label: "Thumbtack", action: "Book" });
  });
});
