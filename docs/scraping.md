# Scraping & OSINT

[← Back to README](../README.md) · [Architecture](./architecture.md) · [Configuration](./configuration.md) · [Development](./development.md)

SimplyServed can bootstrap its directory with net-new business profiles by
scraping public sources. The pipeline is layered so each piece stays testable
and polite:

```
adapter.discover(target) → adapter.normalize(raw)
                              ↓
                          dedup/merge → BusinessProfile (+ BusinessSource, BusinessMedia)
                              ↓
                          owner "Claim" flow → Listing
```

## Sources (`lib/scrapers/`)

| Source           | Adapter      | Enabled by                     | Notes                                                            |
| ---------------- | ------------ | ------------------------------ | ---------------------------------------------------------------- |
| OpenStreetMap    | `osm`        | _always_ (ODbL, no key)        | Default seed source.                                             |
| Yelp Fusion API  | `yelp`       | `YELP_API_KEY`                 | Official API only — never scrapes HTML.                          |
| Google Places    | `google`     | `GOOGLE_PLACES_API_KEY`        | Official API only.                                               |
| Chamber of Comm. | `chamber`    | `SCRAPE_CHAMBERS=1` + JSON cfg | Generic CSS adapter (`data/chambers.json`).                      |
| BBB / YellowPgs  | _(planned)_  | per-site env flag              | Same generic-adapter pattern.                                    |
| FB / IG (OG meta)| `social`     | `SCRAPE_SOCIAL_OG=1`           | Only public `og:*` tags. Never private.                          |
| Company website  | `website`    | `SCRAPE_WEBSITE_OFFERS=1`      | Public schema.org JSON-LD only → DIRECT channel prices.          |
| DoorDash store   | `doordash`   | `SCRAPE_DOORDASH=1`            | Public JSON-LD on the store page → DOORDASH channel.             |
| Angi pro         | `angi`       | `SCRAPE_ANGI=1`                | Public JSON-LD on the pro page → ANGI channel.                   |

The last three share one polite, config-driven factory (`lib/scrapers/marketplace.ts`).
Each reads only public schema.org JSON-LD already exposed to search engines (parsed by
`lib/scrapers/jsonld.ts`) to enrich profiles with price quotes and hero images.

## Cross-channel price comparison

Each `BusinessProfile` can carry `BusinessPriceQuote` rows — one advertised
price per `(channel, item)` across direct site, DoorDash, Angi, and more.

`components/PriceComparisonTable.tsx` renders a sorted comparison table that flags
the best available price and includes a deep-link CTA. `lib/deeplinks.ts` maps storefront
URLs to native app deep links with web fallback. `lib/scrapers/pricing.ts` owns merge + sort policy.
New quotes flow through the same runner upsert path as media and dedupe per channel on re-scrape.

## Politeness and safety rules (`lib/scrapers/http.ts`)

- `robots.txt` fetched + cached and checked before outbound requests.
- Per-host token bucket via `lib/rateLimit.ts` (Redis-backed), default 1 req/s.
- Exponential backoff with jitter on 429/5xx; `Retry-After` honored.
- Descriptive user-agent: `SimplyServed-Bot/1.0 (+contact)`.
- Global circuit breaker: `SET scraper:halt 1` in Redis stops all scrapers.

## Dedup + merge (`lib/scrapers/merge.ts`)

Highest-risk portion; covered by `lib/scrapers/__tests__/merge.test.ts`.

1. Same `(source, externalId)` → update existing source row in place.
2. Same `dedupeKey` (SHA-256 of normalized name + phone + geo) → attach source.
3. Fuzzy: name token-set ≥ 0.9 AND (within 100m OR phone match) → auto-merge.
   Confidence 0.7–0.9 routes to admin review (`/dashboard/admin/merges`).
4. Garbage filter rejects missing name/geo, stop-list names (`test`, `closed`),
   binary descriptions, and 0,0 sentinel coordinates.
5. Per-field merge precedence: GOOGLE > YELP > CHAMBER > BBB > YELLOWPAGES > OSM > others.

## Running the pipeline

```bash
# Zero-config: auto-seeds all OSM targets and any other enabled scrapers.
# Safe to run from cron with no arguments.
npm run scrape:tick       # picks up due jobs; if queue is empty, seeds + runs
npm run scrape:once       # alias for the above

# Override with an explicit target (backward-compatible, no longer required):
npm run scrape:once -- --source osm --target sf-mission

# In docker compose (off by default — safe):
SCRAPE_ENABLED=1 docker compose up scrape
```

### Auto-seed behavior

When the queue is empty, `scrape:tick` iterates every enabled scraper × every target in
`data/osm-targets.json` and creates `ScrapeJob` rows, skipping any target with a live
QUEUED/RUNNING job or a completed job within `SCRAPE_REFRESH_INTERVAL_MS`.

Jobs run sequentially with politeness delay (`SCRAPE_JOB_DELAY_MS`, default 2 s).
Each tick is capped by `SCRAPE_BATCH` (default 5). On `RATE_LIMITED`, the tick stops
pulling new jobs immediately. Single-job failures are logged and skipped; tick exits 0.

### Environment overrides (optional)

| Variable | Default | Description |
| --- | --- | --- |
| `SCRAPE_BATCH` | `5` | Max jobs per tick |
| `SCRAPE_JOB_DELAY_MS` | `2000` | Delay between jobs (ms) |
| `SCRAPE_REFRESH_INTERVAL_MS` | `3600000` | Min age before re-seeding (ms) |

## Claim and takedown flows

- **Claim flow:** Unclaimed `BusinessProfile` rows appear at `/businesses`. Owners can claim via
  email-domain match, phone OTP, or document upload (admin reviewed). On verification, a real
  `Listing` is minted in one transaction and back-links via `originBusinessProfileId`.
  Future scrape refreshes update only fields not owner-overridden (`Listing.ownerOverrides`).
- **Takedown:** `/businesses/<slug>/takedown` accepts removal requests. Tombstoned profiles are
  never re-ingested.

## Related docs

- System architecture and realtime: [Architecture](./architecture.md)
- Full environment variable reference: [Configuration](./configuration.md)
- Local run/test commands: [Development](./development.md)
