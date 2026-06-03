import { createServer, type IncomingMessage } from "node:http";
import { URL } from "node:url";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { getSessionUserFromCookieHeader } from "@/lib/auth";
import { runAgent } from "@/lib/agents/runner";
import { onboardingAgent } from "@/lib/agents/onboarding";
import {
  parseClientMessage,
  type OnboardingServerMessage,
} from "@/lib/agents/onboarding_protocol";
import { rateLimit } from "@/lib/rateLimit";
import type { ChatMessage } from "@/lib/ollama";

const port = Number(process.env.ONBOARDING_WS_PORT ?? 3001);
const host = process.env.ONBOARDING_WS_HOST ?? "0.0.0.0";
const path = process.env.ONBOARDING_WS_PATH ?? "/api/agent/onboarding/ws";
const maxBufferedBytes = Number(process.env.ONBOARDING_WS_MAX_BUFFER ?? 1_000_000);
const maxBackpressureWaitMs = 2_000;

const httpServer = createServer((_req, res) => {
  res.writeHead(404);
  res.end("Not found");
});

const wsServer = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (request, socket, head) => {
  const rawUrl = request.url ?? "/";
  const url = new URL(rawUrl, `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname !== path) {
    socket.destroy();
    return;
  }
  wsServer.handleUpgrade(request, socket, head, (ws) => {
    wsServer.emit("connection", ws, request);
  });
});

wsServer.on("connection", (ws, request) => {
  void handleConnection(ws, request).catch(async (err: unknown) => {
    await safeSend(ws, {
      type: "error",
      code: "BAD_REQUEST",
      error: (err as Error).message || "WebSocket session failed.",
    });
    ws.close(1011, "internal error");
  });
});

httpServer.listen(port, host, () => {
  console.log(`[onboarding-ws] listening on ws://${host}:${port}${path}`);
});

async function handleConnection(
  ws: WebSocket,
  request: IncomingMessage,
): Promise<void> {
  const user = await getSessionUserFromCookieHeader(request.headers.cookie);
  if (!user) {
    await safeSend(ws, {
      type: "error",
      code: "UNAUTHORIZED",
      error: "Sign in required.",
    });
    ws.close(4401, "unauthorized");
    return;
  }

  let activeAbort: AbortController | null = null;
  let reconnect = false;

  await safeSend(ws, { type: "ready", reconnect });

  ws.on("message", (raw: RawData) => {
    void handleMessage(raw, ws, user.id, request).catch(async (err: unknown) => {
      await safeSend(ws, {
        type: "error",
        code: "BAD_REQUEST",
        error: (err as Error).message || "Invalid message.",
      });
    });
  });

  ws.on("close", () => {
    reconnect = true;
    activeAbort?.abort();
    activeAbort = null;
  });

  async function handleMessage(
    raw: RawData,
    socket: WebSocket,
    userId: string,
    req: IncomingMessage,
  ): Promise<void> {
    const msg = parseClientMessage(raw.toString());
    if (!msg) {
      await safeSend(socket, {
        type: "error",
        code: "BAD_REQUEST",
        error: "Malformed message payload.",
      });
      return;
    }
    if (msg.type === "ping") return;

    const fwd = req.headers["x-forwarded-for"];
    const ip = (
      Array.isArray(fwd) ? fwd[0] : fwd
    )?.split(",")[0]?.trim() || req.headers["x-real-ip"] || "anon";
    const rl = await rateLimit(`agent:onboarding:${userId}:${ip}`, 20, 60);
    if (!rl.allowed) {
      await safeSend(socket, {
        type: "error",
        code: "RATE_LIMITED",
        error: "Slow down — too many onboarding messages right now.",
      });
      return;
    }

    activeAbort?.abort();
    activeAbort = new AbortController();

    const history: ChatMessage[] = (msg.history ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      for await (const evt of runAgent({
        agent: onboardingAgent,
        ctx: {
          userId,
          lat: msg.lat ?? 37.7749,
          lng: msg.lng ?? -122.4194,
        },
        history,
        userMessage: msg.message,
        signal: activeAbort.signal,
      })) {
        if (evt.type === "token") {
          await safeSend(socket, { type: "token", text: evt.text });
        } else if (evt.type === "done") {
          await safeSend(socket, { type: "done", content: evt.content });
        } else if (evt.type === "error") {
          await safeSend(socket, {
            type: "error",
            code: "BAD_REQUEST",
            error: evt.error,
          });
        } else {
          await safeSend(socket, { type: "step", event: evt });
        }
      }
    } catch (err) {
      await safeSend(socket, {
        type: "error",
        code: "BAD_REQUEST",
        error: (err as Error).message || "Onboarding agent failed.",
      });
    } finally {
      activeAbort = null;
    }
  }
}

async function safeSend(ws: WebSocket, msg: OnboardingServerMessage): Promise<void> {
  if (ws.readyState !== WebSocket.OPEN) return;
  let waited = 0;
  while (ws.readyState === WebSocket.OPEN && ws.bufferedAmount > maxBufferedBytes) {
    if (waited >= maxBackpressureWaitMs) {
      throw new Error("Socket backpressure exceeded safe threshold.");
    }
    await sleep(25);
    waited += 25;
  }
  if (ws.readyState !== WebSocket.OPEN) return;
  await new Promise<void>((resolve, reject) => {
    ws.send(JSON.stringify(msg), (err) => (err ? reject(err) : resolve()));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
