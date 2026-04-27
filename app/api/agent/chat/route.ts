import { runAgent, type AgentEvent } from "@/lib/agents/runner";
import { conciergeAgent } from "@/lib/agents/concierge";
import { providerCoachAgent } from "@/lib/agents/provider_coach";
import { getSessionUser } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import type { ChatMessage } from "@/lib/ollama";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AGENTS = {
  concierge: conciergeAgent,
  provider_coach: providerCoachAgent,
};

interface ChatRequest {
  agent: keyof typeof AGENTS;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
  lat?: number;
  lng?: number;
}

/**
 * Streams agent events as Server-Sent Events.
 *
 *   POST /api/agent/chat
 *     body: { agent, message, history?, lat?, lng? }
 *
 * Why POST + SSE response (instead of EventSource which only does GET): we
 * need to send the user's message and prior turns in the request body. The
 * client uses fetch() with a streaming reader.
 */
export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!body.message?.trim()) {
    return new Response("Missing message", { status: 400 });
  }
  const agent = AGENTS[body.agent];
  if (!agent) {
    return new Response("Unknown agent", { status: 400 });
  }

  // Provider coach requires sign-in (it can scope to your listings); concierge
  // is fine anonymous, but we still pass the user when known.
  const user = await getSessionUser();
  if (agent.id === "provider_coach" && !user) {
    return new Response("Sign in required", { status: 401 });
  }

  // Rate limit: 10 agent runs / minute / user (or per-IP for anonymous
  // concierge sessions). LLM inference is expensive even on the local box;
  // this protects the model and the DB from a single chatty client.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "anon";
  const rlKey = `agent:${user?.id ?? `ip:${ip}`}`;
  const rl = await rateLimit(rlKey, 10, 60);
  if (!rl.allowed) {
    return new Response("Slow down — too many agent calls. Try again in a moment.", {
      status: 429,
      headers: {
        "Content-Type": "text/plain",
        ...rateLimitHeaders(rl),
      },
    });
  }

  const ctx = {
    userId: user?.id ?? null,
    lat: typeof body.lat === "number" ? body.lat : 37.7749,
    lng: typeof body.lng === "number" ? body.lng : -122.4194,
  };

  const history: ChatMessage[] = (body.history ?? [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-10) // bounded context
    .map((m) => ({ role: m.role, content: m.content }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          /* controller may be closed; ignore */
        }
      };

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* ignore */
        }
      }, 25_000);

      const abort = new AbortController();
      const onAbort = () => abort.abort();
      request.signal.addEventListener("abort", onAbort);

      try {
        for await (const evt of runAgent({
          agent,
          ctx,
          history,
          userMessage: body.message,
          signal: abort.signal,
        })) {
          send(evt);
        }
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
      } finally {
        clearInterval(heartbeat);
        request.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...rateLimitHeaders(rl),
    },
  });
}
