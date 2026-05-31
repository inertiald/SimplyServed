/**
 * Tests for the schema.org JSON-LD extractor.
 *
 *   node --import tsx --test lib/scrapers/__tests__/jsonld.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractBusinessCore,
  extractMedia,
  extractPriceQuotes,
  parseJsonLd,
} from "../jsonld";

const restaurantHtml = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "name": "Joe's Pizza",
  "telephone": "(415) 555-1212",
  "url": "https://joes.example",
  "image": ["https://cdn.example/hero.jpg", "https://cdn.example/2.jpg"],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "1 Market St",
    "addressLocality": "San Francisco",
    "addressRegion": "CA",
    "postalCode": "94105",
    "addressCountry": "US"
  },
  "geo": { "@type": "GeoCoordinates", "latitude": 37.7937, "longitude": -122.3965 },
  "aggregateRating": { "ratingValue": "4.6", "reviewCount": 233 }
}
</script>
<script type="application/ld+json">
{ "@graph": [
  { "@type": "Product", "name": "Margherita", "offers": { "@type": "Offer", "price": "12.50", "priceCurrency": "USD" } },
  { "@type": "Product", "name": "Pepperoni", "offers": { "@type": "Offer", "price": "$14.00", "priceCurrency": "USD" } }
]}
</script>
</head><body></body></html>`;

describe("parseJsonLd", () => {
  it("flattens @graph and multiple script blocks", () => {
    const nodes = parseJsonLd(restaurantHtml);
    assert.ok(nodes.length >= 3);
  });

  it("never throws on malformed JSON", () => {
    const nodes = parseJsonLd(
      `<script type="application/ld+json">{ not json,,, </script>`,
    );
    assert.deepEqual(nodes, []);
  });
});

describe("extractPriceQuotes", () => {
  it("reads Product offers with $ and comma stripping", () => {
    const quotes = extractPriceQuotes(restaurantHtml);
    const margherita = quotes.find((q) => q.label === "Margherita");
    const pepperoni = quotes.find((q) => q.label === "Pepperoni");
    assert.equal(margherita?.amount, 12.5);
    assert.equal(pepperoni?.amount, 14);
    assert.equal(pepperoni?.currency, "USD");
  });

  it("dedupes identical label+price pairs", () => {
    const html = `
      <script type="application/ld+json">{"@type":"Offer","name":"X","price":"9.99","priceCurrency":"USD"}</script>
      <script type="application/ld+json">{"@type":"Offer","name":"X","price":"9.99","priceCurrency":"USD"}</script>`;
    assert.equal(extractPriceQuotes(html).length, 1);
  });

  it("ignores zero / missing prices", () => {
    const html = `<script type="application/ld+json">{"@type":"Offer","name":"Free","price":"0"}</script>`;
    assert.equal(extractPriceQuotes(html).length, 0);
  });

  it("rejects malformed prices with multiple decimal points", () => {
    const html = `<script type="application/ld+json">{"@type":"Offer","name":"Bad","price":"12.34.56"}</script>`;
    assert.equal(extractPriceQuotes(html).length, 0);
  });

  it("rejects negative price strings (no silent sign flip)", () => {
    const html = `<script type="application/ld+json">{"@type":"Offer","name":"Neg","price":"-5.00"}</script>`;
    assert.equal(extractPriceQuotes(html).length, 0);
  });

  it("keeps same-named items that differ in currency", () => {
    const html = `
      <script type="application/ld+json">{"@type":"Offer","name":"Combo","price":"10","priceCurrency":"USD"}</script>
      <script type="application/ld+json">{"@type":"Offer","name":"Combo","price":"10","priceCurrency":"CAD"}</script>`;
    assert.equal(extractPriceQuotes(html).length, 2);
  });
});

describe("extractMedia", () => {
  it("returns deduped image candidates", () => {
    const media = extractMedia(restaurantHtml);
    assert.ok(media.length >= 1);
    assert.equal(media[0].kind, "IMAGE");
    assert.equal(media[0].url, "https://cdn.example/hero.jpg");
  });
});

describe("extractBusinessCore", () => {
  it("pulls name, contact, address, geo, rating", () => {
    const core = extractBusinessCore(restaurantHtml);
    assert.equal(core.name, "Joe's Pizza");
    assert.equal(core.phone, "(415) 555-1212");
    assert.equal(core.city, "San Francisco");
    assert.equal(core.lat, 37.7937);
    assert.equal(core.lng, -122.3965);
    assert.equal(core.rating, 4.6);
    assert.equal(core.reviewCount, 233);
  });
});
