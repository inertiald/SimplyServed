# Architecture

[← Back to README](../README.md) · [Money flow](./money.md) · [AI agents](./agents.md) · [Scraping](./scraping.md) · [Development](./development.md) · [Configuration](./configuration.md)

## Stack overview

| Layer              | Tech                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| Framework          | Next.js 15 (App Router, Server Components, Server Actions)              |
| Database           | PostgreSQL 15 + Prisma 5 (JSONB for polymorphic profiles & metadata)    |
| Auth               | Native: bcrypt + `jose` JWT in an HTTP-only cookie                      |
| Real-time          | Server-Sent Events (`/api/realtime`) backed by Redis pub/sub            |
| Geo discovery      | [H3](https://h3geo.org) hex indexing (city: res 7, hood: res 9)         |
| Validation         | Zod on every Server Action                                               |
| Styling            | Tailwind 3, no design system dependency                                 |
| File uploads       | Local disk (dev) — pluggable interface in `lib/storage.ts`              |
| Payments / payouts | Internal wallet + double-entry ledger (`lib/payments.ts`, Stripe-ready) |

## Data model

- **User** — single account with optional `consumerProfile` and `providerProfile` JSONB blobs.
- **Listing** — service offering with H3 city + neighborhood index, hourly rate, status.
- **ServiceRequest** — strict 10-state workflow machine (`PLACED` → … → `COMPLETED`); forward transitions are enforced in `app/actions/requests.ts`.
- **Impression** — privacy-preserving reactions (HMAC-bucketed by hour, no user-listing edge stored).
- **Post** — polymorphic (`GENERAL` / `BUSINESS` / `OFFER`) with media + offer metadata in JSONB.
- **LedgerEntry** — append-only money movements (`TOPUP` / `HOLD` / `RELEASE` / `FEE` / `REFUND`).

## Request-state machine

`ServiceRequest` transitions are one-way and validated server-side to keep booking state consistent.
The state machine starts at `PLACED` and progresses through acceptance/scheduling, commencement/start,
delivery, and completion (with cancellation/drop paths before completion), matching the flow enforced in
`app/actions/requests.ts`.

## Realtime fan-out

```
Server Action ── publish ──► Redis ──► /api/realtime SSE ──► Vibe map auto-update
                                                          └─► NotificationsBell
                                                          └─► MessageThread (live)
```

The Vibe page subscribes to `vibe:h3:<cell>` channels for the surrounding hex disk plus per-user
notification channels, so new posts appear instantly.

## Related docs

- Wallet, escrow, and fees: [Money flow](./money.md)
- Local LLM agents and Vibe Pulse: [AI agents](./agents.md)
- Scraper subsystem and claim/takedown flows: [Scraping & OSINT](./scraping.md)
- Local setup and scripts: [Development](./development.md)
- Environment variables: [Configuration](./configuration.md)
