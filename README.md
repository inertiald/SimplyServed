# SimplyServed

> **Hyper-local services + neighborhood vibe**, built entirely on Next.js native primitives.
> Discover trusted local providers, share what's actually happening on your block, and
> clip live offers from local businesses — all in one beautifully native app.

```
                        ┌─────────────────────────┐
                        │   Next.js 15 (RSC)      │
                        │   App Router  +  Server │
                        │   Actions  +  Routes    │
                        └─────────────┬───────────┘
                                      │
        ┌───────────────────┬─────────┴──────────┬──────────────────┐
        │                   │                    │                  │
   PostgreSQL 15         Redis 7              H3 hex             Local FS
   (Prisma)              (pub/sub)            indexing           uploads*
                                                                * pluggable: GCS/S3/R2
```

---

## ⚡ Quickstart (30 seconds)

```bash
git clone https://github.com/inertiald/SimplyServed.git
cd SimplyServed
docker compose up
```

That's it. The web app is at **http://localhost:3000**, fully seeded with demo
listings, posts, and a live coupon offer. The onboarding WebSocket server is
also started on **ws://localhost:3001/api/agent/onboarding/ws**.

**Demo accounts** (password: `password123`):

| Email                        | Identity            |
| ---------------------------- | ------------------- |
| `ana@simplyserved.dev`       | Provider + Consumer |
| `diego@simplyserved.dev`     | Provider + Consumer |
| `studiorho@simplyserved.dev` | Provider only       |
| `maya@simplyserved.dev`      | Provider + Consumer |
| `carlos@simplyserved.dev`    | Consumer only       |

The first start takes ~60s while images download and `prisma db push` runs.
Subsequent starts are instant.

---

## ✨ Feature overview

| Layer                | Tech                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| Framework            | Next.js 15 (App Router, Server Components, Server Actions)           |
| Database             | PostgreSQL 15 + Prisma 5 (JSONB for polymorphic profiles & metadata) |
| Auth                 | Native: bcrypt + `jose` JWT in an HTTP-only cookie                   |
| Real-time            | Server-Sent Events (`/api/realtime`) backed by Redis pub/sub         |
| Geo discovery        | [H3](https://h3geo.org) hex indexing (city: res 7, hood: res 9)      |
| Validation           | Zod on every Server Action                                           |
| Styling              | Tailwind 3, no design system dependency                              |
| File uploads         | Local disk (dev) — pluggable interface in `lib/storage.ts`           |
| Payments / payouts   | Stripe Connect-backed wallet + double-entry ledger (`lib/payments.ts`, `lib/wallet.ts`) |

### Data model
- **User** — single account with optional `consumerProfile` and `providerProfile` JSONB blobs.
- **Listing** — service offering with H3 city + neighborhood index, hourly rate, status.
- **ServiceRequest** — strict 10-state workflow machine (PLACED → … → COMPLETED). Forward
  transitions enforced inside `app/actions/requests.ts`.
- **Impression** — privacy-preserving reactions (HMAC-bucketed by hour, no user-listing edge stored).
- **Post** — polymorphic (`GENERAL` / `BUSINESS` / `OFFER`) with media + offer metadata in JSONB.
- **LedgerEntry** — append-only money movements (`TOPUP` / `HOLD` / `RELEASE` / `FEE` / `REFUND`).
  Unique `(requestId, kind)` makes payment side-effects idempotent: a double-clicked
  "Confirm" can't double-charge, and retrying a failed completion can't double-pay out.

### Money flow (MVP wallet)
```
Consumer tops up wallet  ──► consumer balance ↑
Provider responds + schedules
Consumer CONFIRMs        ──► HOLD: consumer balance ↓ (escrow)
Provider COMMENCED → STARTED → DELIVERED
Consumer COMPLETEs       ──► RELEASE: provider balance ↑ (base)
                              FEE:     platform takes 7.5%
Anyone CANCELs/DROPs
  before COMPLETE        ──► REFUND: consumer balance ↑
```
`lib/wallet.ts` exposes `holdForRequest`, `releaseToProvider`, `refundConsumer`,
and `fundWallet` (server-only), now backed by Stripe Connect when Stripe keys
are present. `lib/payments.ts` keeps only the pure fee math so client
components can render quotes without pulling Prisma into the bundle. If Stripe
keys are absent, wallet calls gracefully fall back to the local dev stub so
local development keeps working.

Stripe webhook endpoint: `POST /api/webhooks/stripe` (signature-verified,
idempotent; reconciles account, payment intent, transfer, and payout events).

### Realtime fan-out
```
Server Action ── publish ──► Redis ──► /api/realtime SSE ──► Vibe map auto-update
                                                          └─► NotificationsBell
                                                          └─► MessageThread (live)
```
The Vibe page subscribes to `vibe:h3:<cell>` channels for the surrounding hex disk
plus per-user notification channels. New posts pop in instantly.

### 🤖 Local AI agents (Ollama)

Three agents run against a local **llama-3.2:3b** model (small enough for laptop
CPU, ~1.9 GB on disk). They use the runner in `lib/agents/runner.ts`.

| Agent            | Surface                                   | Tools                                          |
| ---------------- | ----------------------------------------- | ---------------------------------------------- |
| `concierge`      | `/concierge` chat page                    | `search_listings`, `get_listing`, `draft_request` |
| `provider_coach` | "✨ Draft with AI" on new-listing page    | `suggest_price`, `draft_listing`, `draft_offer` |
| `onboarding`     | `/onboarding` page (WebSocket + fallback) | `collect_business_basics`, `choose_category`, `set_location`, `verify_claim_handoff`, `draft_first_listing` |

Tools query Postgres directly (e.g. `search_listings` is restricted to the
caller's H3 ring), so recommendations are actually local. The agent never
*creates* anything — it only drafts; the human commits in the existing UI.

The onboarding agent streams via WebSocket (`ws://.../api/agent/onboarding/ws`)
from `scripts/onboarding-ws.ts`. If the socket is unavailable, the UI
automatically falls back to `POST /api/agent/chat` streaming.

Bring it up with `docker compose up` (the `ollama-init` companion auto-pulls
the model on first boot). The Next.js app gracefully falls back when Ollama is
unreachable, so the rest of the app keeps working without a model.

Override the model with `OLLAMA_MODEL=qwen2.5:3b docker compose up` (any
Ollama-compatible model with tool-calling support works).

### Vibe Pulse
The vibe page asks the local LLM for a 1-sentence neighborhood briefing on
load (`/api/agent/pulse`). With Ollama down it falls back to a deterministic
counts-based summary.

---

## 🧑‍💻 Local development (without Docker)

```bash
npm install
cp .env.local.example .env.local      # edit DATABASE_URL / REDIS_URL
npx prisma db push
npm run prisma:seed
npm run dev
```

Useful scripts:

| Script                  | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `npm run dev`           | Start dev server                         |
| `npm run build`         | Production build                         |
| `npm run lint`          | Next/ESLint                              |
| `npm run prisma:push`   | Sync schema to DB (no migration files)   |
| `npm run prisma:seed`   | Reset & seed demo data                   |
| `npm run ws:onboarding` | Start onboarding WebSocket server        |

For local non-Docker onboarding streaming:
1. Run Next: `npm run dev`
2. In another terminal run: `npm run ws:onboarding`
3. Set `ONBOARDING_WS_URL` in `.env.local` if you need a non-default socket URL.

Stripe environment variables (all optional for local development):

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Enables Stripe wallet + Connect calls |
| `STRIPE_WEBHOOK_SECRET` | Verifies `POST /api/webhooks/stripe` signatures |
| `STRIPE_CONNECT_CLIENT_ID` | Connect OAuth/onboarding client id |

---

## 🗺️ Project layout

```
app/
  (auth)/sign-in        ─ session JWT issued via Server Action
  (auth)/sign-up
  actions/              ─ typed Server Actions (auth, listings, requests, posts)
  api/
    discover            ─ H3 listing query
    feed                ─ cursor-paginated post feed
    realtime            ─ SSE bridge to Redis pub/sub
    media/upload        ─ multipart upload (pluggable storage)
    healthz
  dashboard/
    consumer            ─ request workflow + status badges
    provider            ─ listings + incoming queue
  listings/             ─ browse + detail + booking
  vibe/                 ─ neighborhood map (themed Leaflet/OSM) + live feed
  page.tsx              ─ landing
components/             ─ all client/server UI primitives
lib/
  prisma.ts             ─ singleton client
  redis.ts              ─ best-effort pub/sub
  auth.ts               ─ jose + bcrypt + cookie session
  h3.ts                 ─ thin H3 wrappers
  payments.ts           ─ fee calculator (Stripe-ready)
  storage.ts            ─ local-disk uploads (S3/GCS-ready)
  impressions.ts        ─ HMAC bucketing
prisma/
  schema.prisma
  seed.ts
```

---

## 🛰️ Scraping & OSINT

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

**Sources** (`lib/scrapers/`):

| Source           | Adapter      | Enabled by                       | Notes                                       |
| ---------------- | ------------ | -------------------------------- | ------------------------------------------- |
| OpenStreetMap    | `osm`        | _always_ (ODbL, no key)          | Default seed source.                        |
| Yelp Fusion API  | `yelp`       | `YELP_API_KEY`                   | Official API only — never scrapes HTML.     |
| Google Places    | `google`     | `GOOGLE_PLACES_API_KEY`          | Official API only.                          |
| Chamber of Comm. | `chamber`    | `SCRAPE_CHAMBERS=1` + JSON cfg   | Generic CSS adapter (`data/chambers.json`). |
| BBB / YellowPgs  | `bbb` / `yellowpages` | `SCRAPE_BBB=1` / `SCRAPE_YELLOWPAGES=1` | JSON-LD ItemList + HTML fallback (BBB); result-card HTML (YP). |
| FB / IG (OG meta)| `social`     | `SCRAPE_SOCIAL_OG=1`             | Only public `og:*` tags. Never private.     |
| Company website  | `website`    | `SCRAPE_WEBSITE_OFFERS=1`        | Public schema.org JSON-LD only → DIRECT channel prices. |
| DoorDash store   | `doordash`   | `SCRAPE_DOORDASH=1`              | Public JSON-LD on the store page → DOORDASH channel. |
| Angi pro         | `angi`       | `SCRAPE_ANGI=1`                  | Public JSON-LD on the pro page → ANGI channel. |

The last three share one polite, config-driven factory
(`lib/scrapers/marketplace.ts`). Each reads only the public schema.org
JSON-LD a page already hands to search engines (parsed by the pure
`lib/scrapers/jsonld.ts`) — never private or behind-auth content — to enrich a
profile with **price quotes** and a hero image.

### 💵 Cross-channel price comparison

Every `BusinessProfile` can carry `BusinessPriceQuote` rows — one advertised
price per `(channel, item)` across the company's own site, DoorDash, Angi, etc.
The business profile page renders them as a sorted **price comparison table**
(`components/PriceComparisonTable.tsx`) that flags the best price and shows a
deep-link CTA per row. `lib/deeplinks.ts` (pure + unit-tested) turns each
storefront URL into a native app deep link (e.g. `doordash://store/<id>`) with
the https page as the browser fallback, so a consumer can navigate straight
into the right channel to purchase. `lib/scrapers/pricing.ts` owns the merge +
sort policy. New quotes flow through the same `runner` upsert path as media and
are deduped per channel on re-scrape.


**Rules baked in** (`lib/scrapers/http.ts`):

- `robots.txt` is fetched + cached and checked before every outbound request.
- Per-host token bucket via `lib/rateLimit.ts` (Redis-backed). Default 1 req/s.
- Exponential backoff with jitter on 429/5xx; `Retry-After` honored.
- Descriptive User-Agent: `SimplyServed-Bot/1.0 (+contact)`.
- Global circuit breaker: `SET scraper:halt 1` in Redis stops all scrapers.

**Dedup + merge** (`lib/scrapers/merge.ts`, the highest-risk piece; covered by
unit tests in `lib/scrapers/__tests__/merge.test.ts`):

1. Same `(source, externalId)` → update existing source row in place.
2. Same `dedupeKey` (SHA-256 of normalized name + phone + geo) → attach source.
3. Fuzzy: name token-set ≥ 0.9 AND (within 100m OR phone match) → auto-merge.
   Confidence 0.7–0.9 → routed to admin review queue (`/dashboard/admin/merges`).
4. Garbage filter rejects: missing name/geo, stop-list names ("test", "closed"),
   binary descriptions, 0,0 sentinel coords.
5. Per-field merge precedence: GOOGLE > YELP > CHAMBER > BBB > YELLOWPAGES > OSM > others.

**Running it:**

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

**Auto-seed behavior:** when the job queue is empty, `scrape:tick` iterates
every enabled scraper × every target slug in `data/osm-targets.json` and
creates `ScrapeJob` rows, skipping any target with a live QUEUED/RUNNING job
or a completed job within the last hour (`SCRAPE_REFRESH_INTERVAL_MS`).
Jobs run sequentially with a politeness delay between them
(`SCRAPE_JOB_DELAY_MS`, default 2 s). The batch is capped at
`SCRAPE_BATCH` jobs per tick (default 5). On a `RATE_LIMITED` result the
tick stops pulling new jobs immediately rather than hammering the source.
Single-job failures are logged and skipped; the tick always exits 0.

**Environment overrides (all optional):**

| Variable | Default | Description |
|---|---|---|
| `SCRAPE_BATCH` | `5` | Max jobs per tick |
| `SCRAPE_JOB_DELAY_MS` | `2000` | Delay between jobs (ms) |
| `SCRAPE_REFRESH_INTERVAL_MS` | `3600000` | Min age before re-seeding (ms) |

**Claim flow:** unclaimed `BusinessProfile`s appear at `/businesses`. Owners
hit "Claim this listing" → verify via email-domain match, phone OTP, or
document upload (admin-reviewed). On verify, a real `Listing` is minted in a
single transaction and the profile back-links via `originBusinessProfileId`.
Future scrape refreshes only touch fields the owner hasn't overridden
(`Listing.ownerOverrides`).

**Takedown:** `/businesses/<slug>/takedown` lets anyone request removal.
Tombstoned profiles are never re-ingested.
- Next.js 15 native stack: App Router + RSC + Server Actions.
- Hyper-local discovery with H3 indexing and realtime SSE fan-out over Redis.
- Booking workflow with enforced request-state transitions.
- Internal wallet + append-only ledger escrow flow (Stripe-ready abstraction).
- Local Ollama AI agents (`concierge`, `provider_coach`) and Vibe Pulse summary.
- Polite OSINT scraper pipeline with dedup/merge, claim flow, and takedowns.

---

## 📚 Documentation map

- Stripe Connect end-to-end (provider onboarding + payouts)
- Replace local-disk uploads with GCS signed URLs
- React Native shell that re-uses these same Server Actions over HTTPS
- Background expiry cron for offer posts
- BBB / YellowPages adapters — **done** (`lib/scrapers/bbb.ts`, `lib/scrapers/yellowpages.ts`); per-chamber-site config catalog

Everything above is unblocked because the core abstractions
(`lib/storage.ts`, `lib/payments.ts`, `lib/redis.ts`) are interface-first.
- BBB / YellowPages adapters; per-chamber-site config catalog
- [Architecture](docs/architecture.md)
- [Money flow](docs/money.md)
- [AI agents](docs/agents.md)
- [Scraping & OSINT](docs/scraping.md)
- [Development](docs/development.md)
- [Configuration](docs/configuration.md)
- [Contributing](CONTRIBUTING.md)

For all implementation details previously in this README, use the docs pages
above.
