# Development

[← Back to README](../README.md) · [Configuration](./configuration.md) · [Scraping](./scraping.md) · [Contributing](../CONTRIBUTING.md)

## Local development (without Docker)

```bash
npm install
cp .env.local.example .env.local      # edit DATABASE_URL / REDIS_URL
npx prisma db push
npm run prisma:seed
npm run dev
```

## Useful scripts

| Script                | Purpose                                |
| --------------------- | -------------------------------------- |
| `npm run dev`         | Start dev server                       |
| `npm run build`       | Production build                       |
| `npm run lint`        | Next/ESLint                            |
| `npm test`            | Scraper/domain unit tests              |
| `npm run prisma:push` | Sync schema to DB (no migration files) |
| `npm run prisma:seed` | Reset & seed demo data                 |
| `npm run scrape:tick` | Run one scraper tick (auto-seed aware) |
| `npm run scrape:once` | Alias of `scrape:tick`                 |

## Project layout

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

## Roadmap

- Stripe Connect end-to-end (provider onboarding + payouts)
- Replace local-disk uploads with GCS signed URLs
- WebSocket-based AI onboarding agent (replaces current SSE bridge)
- React Native shell that re-uses these same Server Actions over HTTPS
- Background expiry cron for offer posts
- BBB / YellowPages adapters; per-chamber-site config catalog

Everything above is unblocked because core abstractions (`lib/storage.ts`,
`lib/payments.ts`, `lib/redis.ts`) are interface-first.

## Related docs

- Top-level architecture: [Architecture](./architecture.md)
- Scraper operation + politeness rules: [Scraping](./scraping.md)
- Env variable matrix: [Configuration](./configuration.md)
