# AI agents

[← Back to README](../README.md) · [Architecture](./architecture.md) · [Development](./development.md) · [Configuration](./configuration.md)

## Local Ollama agents

Two agents run against a local **llama3.2:3b** model (small enough for laptop CPU, ~1.9 GB on disk).
Both use `lib/agents/runner.ts`, which drives a chat-with-tools loop and emits structured SSE events:
`thought`, `tool`, `tool_result`, `tool_error`, `token`, `done`, `error`.

| Agent            | Surface                                | Tools                                            |
| ---------------- | -------------------------------------- | ------------------------------------------------ |
| `concierge`      | `/concierge` chat page                 | `search_listings`, `get_listing`, `draft_request` |
| `provider_coach` | “✨ Draft with AI” on new-listing page | `suggest_price`, `draft_listing`, `draft_offer` |

Tools query Postgres directly (for example `search_listings` is restricted to the caller's H3 ring),
so recommendations stay local. Agents only draft; users commit actions in the existing UI.

## Running with Docker

Bring everything up with:

```bash
docker compose up
```

`ollama-init` auto-pulls the model on first boot. If Ollama is unreachable,
the app fails soft and other functionality keeps working.

Override model:

```bash
OLLAMA_MODEL=qwen2.5:3b docker compose up
```

Any Ollama-compatible tool-calling model can be used.

## Vibe Pulse

The Vibe page requests a 1-sentence neighborhood briefing on load (`/api/agent/pulse`).
If Ollama is down, it falls back to a deterministic counts-based summary.

## Related docs

- Core platform architecture: [Architecture](./architecture.md)
- Env vars (`OLLAMA_URL`, `OLLAMA_MODEL`): [Configuration](./configuration.md)
- Local development scripts: [Development](./development.md)
