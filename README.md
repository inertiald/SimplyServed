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

- Next.js 15 native stack: App Router + RSC + Server Actions.
- Hyper-local discovery with H3 indexing and realtime SSE fan-out over Redis.
- Booking workflow with enforced request-state transitions.
- Internal wallet + append-only ledger escrow flow (Stripe-ready abstraction).
- Local Ollama AI agents (`concierge`, `provider_coach`) and Vibe Pulse summary.
- Polite OSINT scraper pipeline with dedup/merge, claim flow, and takedowns.

---

## 📚 Documentation map

- [Architecture](docs/architecture.md)
- [Money flow](docs/money.md)
- [AI agents](docs/agents.md)
- [Scraping & OSINT](docs/scraping.md)
- [Development](docs/development.md)
- [Configuration](docs/configuration.md)
- [Contributing](CONTRIBUTING.md)

For all implementation details previously in this README, use the docs pages
above.
