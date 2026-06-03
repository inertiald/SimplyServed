# Configuration reference

[← Back to README](../README.md) · [Development](./development.md) · [Scraping](./scraping.md) · [AI agents](./agents.md)

This table consolidates environment variables from `.env.local.example`,
`docker-compose.yml`, and README sections.

## Core app variables

| Variable | Required | Default | Used by | Notes |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Yes | `.env.local.example` points to `localhost`; compose points to `db` | web, simulator, scrape | PostgreSQL connection string. |
| `REDIS_URL` | Yes | `.env.local.example` points to `localhost`; compose points to `redis` | web, simulator, scrape | Redis pub/sub and future caching/rate-limit. |
| `AUTH_SECRET` | Required in production | `dev-only-secret-please-change-me-...` in compose | web | 32+ chars recommended; JWT signing secret. |
| `IMPRESSION_SECRET` | Optional | Falls back to `AUTH_SECRET` | web | HMAC secret for impression hashing. |
| `NODE_ENV` | Optional | `production` (web/scrape), `${NODE_ENV:-development}` (simulator) | compose services | Runtime mode. |

## Local AI / Ollama

| Variable | Required | Default | Used by | Notes |
| --- | --- | --- | --- | --- |
| `OLLAMA_URL` | Optional | `http://ollama:11434` in compose | web | Local model endpoint. |
| `OLLAMA_MODEL` | Optional | `llama3.2:3b` | web, ollama-init | Any tool-calling compatible Ollama model works. |
| `OLLAMA_HOST` | Internal compose helper | `http://ollama:11434` | ollama-init | Used by model-pull bootstrap container. |

## Scraping / OSINT variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `SCRAPE_ENABLED` | Optional | unset (`scrape` service sleeps) | Set `1` to run continuous scraper tick in compose. |
| `OVERPASS_URL` | Optional | Overpass public endpoint | Override for self-hosted Overpass. |
| `YELP_API_KEY` | Optional | unset | Enables Yelp adapter (official API only). |
| `GOOGLE_PLACES_API_KEY` | Optional | unset | Enables Google Places adapter. |
| `SCRAPE_CHAMBERS` | Optional | unset | Set `1` to enable chamber generic adapter. |
| `SCRAPE_SOCIAL_OG` | Optional | unset | Set `1` to enable public OG metadata enrichment. |
| `SCRAPE_WEBSITE_OFFERS` | Optional | unset | Set `1` to parse schema.org offers from company sites. |
| `SCRAPE_DOORDASH` | Optional | unset | Set `1` to parse schema.org offers from DoorDash pages. |
| `SCRAPE_ANGI` | Optional | unset | Set `1` to parse schema.org offers from Angi pages. |
| `SCRAPE_BATCH` | Optional | `5` | Max jobs per scraper tick. |
| `SCRAPE_JOB_DELAY_MS` | Optional | `2000` | Delay between jobs in milliseconds. |
| `SCRAPE_REFRESH_INTERVAL_MS` | Optional | `3600000` | Min age before reseeding target jobs. |

## Compose-only service variables

| Variable | Service(s) | Purpose |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `db` | Postgres container bootstrap credentials/database. |
| `ENABLE_SIMULATION` | `simulator` | Enables simulation mode for the simulator task. |

## Quick setup patterns

### Local (without Docker)

1. Copy `.env.local.example` to `.env.local`.
2. Set `DATABASE_URL`, `REDIS_URL`, and `AUTH_SECRET`.
3. Optionally set AI/scraper vars.

### Docker Compose

- `DATABASE_URL`, `REDIS_URL`, and `OLLAMA_URL` are pre-wired to internal service hostnames.
- Set `AUTH_SECRET` in your shell to override compose default.
- Set `SCRAPE_ENABLED=1` to activate the `scrape` service loop.

## Related docs

- Development workflow and scripts: [Development](./development.md)
- Scraper subsystem details: [Scraping](./scraping.md)
- Local AI behavior: [AI agents](./agents.md)
