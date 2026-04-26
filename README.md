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
listings, posts, and a live coupon offer.

**Demo accounts** (password: `password123`):

| Email                          | Identity            |
| ------------------------------ | ------------------- |
| `ana@simplyserved.dev`         | Provider + Consumer |
| `diego@simplyserved.dev`       | Provider + Consumer |
| `studiorho@simplyserved.dev`   | Provider only       |
| `maya@simplyserved.dev`        | Provider + Consumer |
| `carlos@simplyserved.dev`      | Consumer only       |

The first start takes ~60s while images download and `prisma db push` runs.
Subsequent starts are instant.

---

## 🏗️ Architecture

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
| Payments / payouts   | Internal wallet + double-entry ledger (`lib/payments.ts`, Stripe-ready) |

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
`lib/payments.ts` exposes `holdForRequest`, `releaseToProvider`, `refundConsumer`,
and `fundWallet`. Swap those four function bodies for Stripe PaymentIntents +
Transfers + Refunds and the rest of the app stays untouched.

### Realtime fan-out
```
Server Action ── publish ──► Redis ──► /api/realtime SSE ──► Vibe map auto-update
```
The Vibe page subscribes to `vibe:h3:<cell>` channels for the surrounding hex disk
plus per-user notification channels. New posts pop in instantly.

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
  vibe/                 ─ hex-grid neighborhood map (SVG, no map-library dep)
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

## 🚀 Roadmap (intentionally out of this PR)

- Stripe Connect end-to-end (provider onboarding + payouts)
- Replace local-disk uploads with GCS signed URLs
- WebSocket-based AI onboarding agent (replaces the current SSE bridge)
- React Native shell that re-uses these same Server Actions over HTTPS
- Background expiry cron for offer posts

Everything above is unblocked because the core abstractions
(`lib/storage.ts`, `lib/payments.ts`, `lib/redis.ts`) are interface-first.
