/**
 * Tests for the price-comparison assembler.
 *
 *   node --import tsx --test lib/scrapers/__tests__/pricing.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  comparisonRows,
  defaultChannelForSource,
  formatPrice,
  resolvePriceChannel,
  type QuoteInput,
} from "../pricing";

const quotes: QuoteInput[] = [
  {
    channel: "DOORDASH",
    source: "DOORDASH",
    label: "Margherita",
    amount: 15.99,
    currency: "USD",
    url: "https://www.doordash.com/store/joes-12345",
  },
  {
    channel: "DIRECT",
    source: "WEBSITE",
    label: "Margherita",
    amount: 12.0,
    currency: "USD",
    url: "https://joes.example/order",
  },
  {
    channel: "UBEREATS",
    source: "UBEREATS",
    label: "Margherita",
    amount: 16.5,
    currency: "USD",
    url: "https://www.ubereats.com/store/joes-99",
    available: false,
  },
];

describe("comparisonRows", () => {
  it("sorts cheapest available first and flags the best price", () => {
    const rows = comparisonRows(quotes);
    assert.equal(rows[0].channel, "DIRECT");
    assert.equal(rows[0].cheapest, true);
    assert.equal(rows[0].premiumPct, 0);
  });

  it("computes premium percentage vs the cheapest", () => {
    const rows = comparisonRows(quotes);
    const dd = rows.find((r) => r.channel === "DOORDASH");
    // (15.99 - 12) / 12 = 33.25% → 33
    assert.equal(dd?.premiumPct, 33);
    assert.equal(dd?.cheapest, false);
  });

  it("sinks unavailable rows to the bottom and never marks them cheapest", () => {
    const rows = comparisonRows(quotes);
    assert.equal(rows[rows.length - 1].channel, "UBEREATS");
    assert.equal(rows[rows.length - 1].available, false);
    assert.equal(rows[rows.length - 1].cheapest, false);
  });

  it("attaches a native deep link to each row", () => {
    const rows = comparisonRows(quotes);
    const dd = rows.find((r) => r.channel === "DOORDASH");
    assert.equal(dd?.link.appUrl, "doordash://store/joes-12345");
    assert.equal(dd?.link.action, "Order");
  });

  it("drops non-positive amounts", () => {
    const rows = comparisonRows([
      { channel: "DIRECT", source: "WEBSITE", label: "Free", amount: 0, currency: "USD" },
    ]);
    assert.equal(rows.length, 0);
  });
});

describe("resolvePriceChannel", () => {
  it("honors an explicit candidate channel", () => {
    assert.equal(resolvePriceChannel("ANGI", "WEBSITE"), "ANGI");
  });

  it("falls back to the source's natural channel", () => {
    assert.equal(resolvePriceChannel(undefined, "DOORDASH"), "DOORDASH");
    assert.equal(resolvePriceChannel("BOGUS", "GRUBHUB"), "GRUBHUB");
  });
});

describe("defaultChannelForSource", () => {
  it("maps marketplace sources and defaults the rest to DIRECT", () => {
    assert.equal(defaultChannelForSource("ANGI"), "ANGI");
    assert.equal(defaultChannelForSource("WEBSITE"), "DIRECT");
    assert.equal(defaultChannelForSource("OPENSTREETMAP"), "DIRECT");
  });
});

describe("formatPrice", () => {
  it("formats USD with two decimals", () => {
    assert.equal(formatPrice(12.5), "$12.50");
  });
});
