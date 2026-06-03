# Contributing to SimplyServed

Thanks for contributing!

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL 15
- Redis 7
- (Optional) Docker + Docker Compose for one-command local stack

## Running locally

Follow the local workflow in [docs/development.md](docs/development.md).
For env vars, use [docs/configuration.md](docs/configuration.md).

## Quality checks

Run these before opening a PR:

```bash
npm run lint
npm test
npm run build
```

## Branch and PR conventions

- Use focused branches per task (for example: `docs/readme-split`, `fix/wallet-refund`).
- Keep PRs scoped and easy to review.
- Include a clear summary, testing notes, and any follow-up work in the PR description.
- Do not bundle unrelated refactors with behavior changes.

## Scraper politeness rules

Before changing or adding adapters, read the politeness and safety implementation in:

- `lib/scrapers/http.ts` (robots, retries/backoff, user-agent handling)
- `lib/rateLimit.ts` (per-host token bucket)
- `lib/scrapers/runner.ts` and `lib/scrapers/registry.ts` (execution flow)
- `docs/scraping.md` (high-level policy and operations)

Contributions that add scraping sources should follow these rules so adapters stay polite and compliant.
