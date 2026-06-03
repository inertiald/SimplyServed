/**
 * Tests for the YellowPages scraper adapter.
 *
 *   node --import tsx --test lib/scrapers/__tests__/yellowpages.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseYpHtml } from "../yellowpages";
import { yellowPagesScraper } from "../yellowpages";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Typical YellowPages search-results page with two organic result cards. */
const searchFixture = `<!DOCTYPE html>
<html>
<body>
<div class="search-results">

  <div class="result organics" data-listing-id="111222333">
    <div class="info">
      <h2 class="n">
        <a class="business-name" href="/seattle-wa/mip/acme-plumbing-111222333">Acme Plumbing Co</a>
      </h2>
      <div class="phones phone primary">
        <a href="tel:2065550101">(206) 555-0101</a>
      </div>
      <div class="adr">
        <span class="street-address">123 Main St</span>,
        <span class="locality">Seattle</span>,
        <span class="region">WA</span>
        <span class="zip">98101</span>
      </div>
      <a class="business-website" href="https://acmeplumbing.example" rel="nofollow">acmeplumbing.example</a>
      <p class="snippet">Your local plumbing experts since 1975.</p>
    </div>
  </div>

  <div class="result organics" data-listing-id="444555666">
    <div class="info">
      <h2 class="n">
        <a class="business-name" href="/seattle-wa/mip/best-pipes-444555666">Best Pipes LLC</a>
      </h2>
      <div class="phones phone primary">
        <a href="tel:2065550202">(206) 555-0202</a>
      </div>
      <div class="adr">
        <span class="street-address">456 Oak Ave</span>,
        <span class="locality">Seattle</span>,
        <span class="region">WA</span>
        <span class="zip">98102</span>
      </div>
    </div>
  </div>

</div>
</body>
</html>`;

/** A result card missing a business-name anchor — should be skipped. */
const noNameFixture = `<html><body>
<div class="result organics" data-listing-id="000000001">
  <div class="info">
    <div class="phones phone primary"><a href="tel:2065559999">(206) 555-9999</a></div>
  </div>
</div>
</body></html>`;

const SEARCH_URL =
  "https://www.yellowpages.com/search?search_terms=plumber&geo_location_terms=Seattle%2C+WA";

// ── Discovery parsing tests ───────────────────────────────────────────────────

describe("parseYpHtml — normal search results", () => {
  const items = parseYpHtml(searchFixture, SEARCH_URL);

  it("discovers two business items", () => {
    assert.equal(items.length, 2);
  });

  it("sets source to YELLOWPAGES", () => {
    assert.ok(items.every((i) => i.source === "YELLOWPAGES"));
  });

  it("sets sourceUrl to the search URL", () => {
    assert.ok(items.every((i) => i.sourceUrl === SEARCH_URL));
  });

  it("extracts listing ID as externalId", () => {
    assert.equal(items[0].externalId, "111222333");
    assert.equal(items[1].externalId, "444555666");
  });

  it("extracts business name", () => {
    const p = items[0].payload as Record<string, unknown>;
    assert.equal(p.name, "Acme Plumbing Co");
  });

  it("extracts phone", () => {
    const p = items[0].payload as Record<string, unknown>;
    assert.equal(p.phone, "(206) 555-0101");
  });

  it("extracts street address", () => {
    const p = items[0].payload as Record<string, unknown>;
    assert.equal(p.address, "123 Main St");
  });

  it("extracts city", () => {
    const p = items[0].payload as Record<string, unknown>;
    assert.equal(p.city, "Seattle");
  });

  it("extracts state/region", () => {
    const p = items[0].payload as Record<string, unknown>;
    assert.equal(p.region, "WA");
  });

  it("extracts postal code", () => {
    const p = items[0].payload as Record<string, unknown>;
    assert.equal(p.postalCode, "98101");
  });

  it("extracts external website URL", () => {
    const p = items[0].payload as Record<string, unknown>;
    assert.equal(p.website, "https://acmeplumbing.example");
  });

  it("extracts description/snippet", () => {
    const p = items[0].payload as Record<string, unknown>;
    assert.equal(p.description, "Your local plumbing experts since 1975.");
  });

  it("builds an absolute YP listing URL", () => {
    const p = items[0].payload as Record<string, unknown>;
    assert.ok(
      (p.ypUrl as string).startsWith("https://www.yellowpages.com/"),
    );
  });

  it("handles a result with no website or description", () => {
    const p = items[1].payload as Record<string, unknown>;
    assert.equal(p.website, undefined);
    assert.equal(p.description, undefined);
    assert.equal(p.name, "Best Pipes LLC");
  });
});

describe("parseYpHtml — result block without a business name", () => {
  it("skips the block and returns empty array", () => {
    const items = parseYpHtml(noNameFixture, SEARCH_URL);
    assert.equal(items.length, 0);
  });
});

describe("parseYpHtml — empty page", () => {
  it("returns empty array", () => {
    const items = parseYpHtml("<html><body><p>No results.</p></body></html>", SEARCH_URL);
    assert.equal(items.length, 0);
  });
});

// ── Normalization tests ───────────────────────────────────────────────────────

describe("yellowPagesScraper.normalize", () => {
  const rawFull = {
    source: "YELLOWPAGES" as const,
    sourceUrl: SEARCH_URL,
    externalId: "111222333",
    payload: {
      listingId: "111222333",
      name: "Acme Plumbing Co",
      phone: "(206) 555-0101",
      website: "https://acmeplumbing.example",
      address: "123 Main St",
      city: "Seattle",
      region: "WA",
      postalCode: "98101",
      description: "Your local plumbing experts since 1975.",
      ypUrl: "https://www.yellowpages.com/seattle-wa/mip/acme-plumbing-111222333",
    },
  };

  it("returns a NormalizedBusiness with correct fields", () => {
    const nb = yellowPagesScraper.normalize(rawFull);
    assert.ok(nb !== null);
    assert.equal(nb!.name, "Acme Plumbing Co");
    assert.equal(nb!.source, "YELLOWPAGES");
    assert.equal(nb!.phone, "(206) 555-0101");
    assert.equal(nb!.website, "https://acmeplumbing.example");
    assert.equal(nb!.address, "123 Main St");
    assert.equal(nb!.city, "Seattle");
    assert.equal(nb!.region, "WA");
    assert.equal(nb!.postalCode, "98101");
    assert.equal(nb!.description, "Your local plumbing experts since 1975.");
  });

  it("returns null when name is empty", () => {
    const raw = { ...rawFull, payload: { ...rawFull.payload, name: "" } };
    assert.equal(yellowPagesScraper.normalize(raw), null);
  });

  it("returns null when payload is missing", () => {
    const raw = { ...rawFull, payload: null };
    assert.equal(yellowPagesScraper.normalize(raw as never), null);
  });

  it("preserves externalId (listing ID)", () => {
    const nb = yellowPagesScraper.normalize(rawFull);
    assert.equal(nb!.externalId, "111222333");
  });

  it("trims leading/trailing whitespace from name", () => {
    const raw = { ...rawFull, payload: { ...rawFull.payload, name: "  Acme Plumbing Co  " } };
    const nb = yellowPagesScraper.normalize(raw);
    assert.equal(nb!.name, "Acme Plumbing Co");
  });
});

// ── enabled() tests ───────────────────────────────────────────────────────────

describe("yellowPagesScraper.enabled", () => {
  it("returns false when SCRAPE_YELLOWPAGES is unset", () => {
    delete process.env.SCRAPE_YELLOWPAGES;
    assert.equal(yellowPagesScraper.enabled(), false);
  });

  it("returns true when SCRAPE_YELLOWPAGES=1", () => {
    process.env.SCRAPE_YELLOWPAGES = "1";
    assert.equal(yellowPagesScraper.enabled(), true);
    delete process.env.SCRAPE_YELLOWPAGES;
  });

  it("returns false for other values", () => {
    process.env.SCRAPE_YELLOWPAGES = "true";
    assert.equal(yellowPagesScraper.enabled(), false);
    delete process.env.SCRAPE_YELLOWPAGES;
  });
});
