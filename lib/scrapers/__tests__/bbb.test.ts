/**
 * Tests for the BBB scraper adapter.
 *
 *   node --import tsx --test lib/scrapers/__tests__/bbb.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBbbHtml } from "../bbb";
import { bbbScraper } from "../bbb";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Search page with an ItemList JSON-LD block (primary path). */
const jsonldFixture = `<!DOCTYPE html>
<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Plumbers in Seattle, WA",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "LocalBusiness",
        "name": "Acme Plumbing Co",
        "telephone": "(206) 555-0101",
        "url": "https://www.bbb.org/us/wa/seattle/plumbing/acme-plumbing-12345678",
        "sameAs": "https://acmeplumbing.example",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "123 Main St",
          "addressLocality": "Seattle",
          "addressRegion": "WA",
          "postalCode": "98101",
          "addressCountry": "US"
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.8",
          "reviewCount": 57
        }
      }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": {
        "@type": "LocalBusiness",
        "name": "Best Pipes LLC",
        "telephone": "(206) 555-0202",
        "url": "https://www.bbb.org/us/wa/seattle/plumbing/best-pipes-87654321",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "456 Oak Ave",
          "addressLocality": "Seattle",
          "addressRegion": "WA",
          "postalCode": "98102"
        }
      }
    }
  ]
}
</script>
</head>
<body><p>Search results</p></body>
</html>`;

/** Search page without JSON-LD — exercises the HTML fallback path. */
const htmlFallbackFixture = `<!DOCTYPE html>
<html>
<body>
<ul class="search-results">
  <li>
    <a href="/us/wa/seattle/plumbing/acme-plumbing-12345678">Acme Plumbing Co</a>
    <span class="address">123 Main St, Seattle, WA 98101</span>
  </li>
  <li>
    <a href="/us/wa/seattle/plumbing/best-pipes-87654321">Best Pipes LLC</a>
    <span class="address">456 Oak Ave, Seattle, WA 98102</span>
  </li>
</ul>
</body>
</html>`;

const SEARCH_URL = "https://www.bbb.org/search?find_text=plumber&find_loc=Seattle%2C+WA";

// ── Discovery parsing tests ───────────────────────────────────────────────────

describe("parseBbbHtml — JSON-LD ItemList (primary path)", () => {
  const items = parseBbbHtml(jsonldFixture, SEARCH_URL);

  it("discovers two business items", () => {
    assert.equal(items.length, 2);
  });

  it("sets source to BBB", () => {
    assert.ok(items.every((i) => i.source === "BBB"));
  });

  it("sets sourceUrl to the search URL", () => {
    assert.ok(items.every((i) => i.sourceUrl === SEARCH_URL));
  });

  it("extracts name from JSON-LD", () => {
    const payload = items[0].payload as Record<string, unknown>;
    assert.equal(payload.name, "Acme Plumbing Co");
  });

  it("extracts phone", () => {
    const payload = items[0].payload as Record<string, unknown>;
    assert.equal(payload.phone, "(206) 555-0101");
  });

  it("extracts website from sameAs", () => {
    const payload = items[0].payload as Record<string, unknown>;
    assert.equal(payload.website, "https://acmeplumbing.example");
  });

  it("extracts address fields", () => {
    const payload = items[0].payload as Record<string, unknown>;
    assert.equal(payload.address, "123 Main St");
    assert.equal(payload.city, "Seattle");
    assert.equal(payload.region, "WA");
    assert.equal(payload.postalCode, "98101");
    assert.equal(payload.country, "US");
  });

  it("extracts aggregateRating", () => {
    const payload = items[0].payload as Record<string, unknown>;
    assert.equal(payload.rating, 4.8);
    assert.equal(payload.reviewCount, 57);
  });

  it("sets externalId to the BBB profile URL", () => {
    assert.equal(
      items[0].externalId,
      "https://www.bbb.org/us/wa/seattle/plumbing/acme-plumbing-12345678",
    );
  });

  it("handles a ListItem without sameAs (no website)", () => {
    const payload = items[1].payload as Record<string, unknown>;
    assert.equal(payload.website, undefined);
  });
});

describe("parseBbbHtml — HTML fallback (no JSON-LD)", () => {
  const items = parseBbbHtml(htmlFallbackFixture, SEARCH_URL);

  it("discovers two business items", () => {
    assert.equal(items.length, 2);
  });

  it("extracts business name from link text", () => {
    const payload = items[0].payload as Record<string, unknown>;
    assert.equal(payload.name, "Acme Plumbing Co");
  });

  it("sets externalId to the absolute BBB URL", () => {
    assert.ok(
      (items[0].externalId as string).startsWith("https://www.bbb.org/us/"),
    );
  });
});

describe("parseBbbHtml — empty page", () => {
  it("returns empty array for a page with no results", () => {
    const items = parseBbbHtml("<html><body><p>No results.</p></body></html>", SEARCH_URL);
    assert.equal(items.length, 0);
  });
});

// ── Normalization tests ───────────────────────────────────────────────────────

describe("bbbScraper.normalize", () => {
  const rawFull = {
    source: "BBB" as const,
    sourceUrl: SEARCH_URL,
    externalId: "https://www.bbb.org/us/wa/seattle/plumbing/acme-plumbing-12345678",
    payload: {
      name: "Acme Plumbing Co",
      phone: "(206) 555-0101",
      website: "https://acmeplumbing.example",
      address: "123 Main St",
      city: "Seattle",
      region: "WA",
      postalCode: "98101",
      country: "US",
      bbbUrl: "https://www.bbb.org/us/wa/seattle/plumbing/acme-plumbing-12345678",
      rating: 4.8,
      reviewCount: 57,
    },
  };

  it("returns a NormalizedBusiness with correct fields", () => {
    const nb = bbbScraper.normalize(rawFull);
    assert.ok(nb !== null);
    assert.equal(nb!.name, "Acme Plumbing Co");
    assert.equal(nb!.source, "BBB");
    assert.equal(nb!.phone, "(206) 555-0101");
    assert.equal(nb!.website, "https://acmeplumbing.example");
    assert.equal(nb!.address, "123 Main St");
    assert.equal(nb!.city, "Seattle");
    assert.equal(nb!.region, "WA");
    assert.equal(nb!.postalCode, "98101");
    assert.equal(nb!.country, "US");
    assert.equal(nb!.rating, 4.8);
    assert.equal(nb!.reviewCount, 57);
  });

  it("returns null when name is empty", () => {
    const raw = { ...rawFull, payload: { ...rawFull.payload, name: "" } };
    assert.equal(bbbScraper.normalize(raw), null);
  });

  it("returns null when payload is missing", () => {
    const raw = { ...rawFull, payload: null };
    assert.equal(bbbScraper.normalize(raw as never), null);
  });

  it("preserves externalId from the raw record", () => {
    const nb = bbbScraper.normalize(rawFull);
    assert.equal(
      nb!.externalId,
      "https://www.bbb.org/us/wa/seattle/plumbing/acme-plumbing-12345678",
    );
  });
});

// ── enabled() tests ───────────────────────────────────────────────────────────

describe("bbbScraper.enabled", () => {
  it("returns false when SCRAPE_BBB is unset", () => {
    delete process.env.SCRAPE_BBB;
    assert.equal(bbbScraper.enabled(), false);
  });

  it("returns true when SCRAPE_BBB=1", () => {
    process.env.SCRAPE_BBB = "1";
    assert.equal(bbbScraper.enabled(), true);
    delete process.env.SCRAPE_BBB;
  });

  it("returns false for other values", () => {
    process.env.SCRAPE_BBB = "true";
    assert.equal(bbbScraper.enabled(), false);
    delete process.env.SCRAPE_BBB;
  });
});
