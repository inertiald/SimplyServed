/**
 * Tiny Ollama client. Uses the native /api/chat endpoint so we get streaming
 * and (with capable models) function/tool calling out of the box. Designed to
 * fail soft: when Ollama is unreachable, callers get a structured "unavailable"
 * signal rather than an exception.
 *
 * No SDK dependency on purpose — Ollama's HTTP API is stable and small.
 */
import "server-only";

const BASE_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Echoed back when role === "tool" so the model can correlate calls. */
  tool_call_id?: string;
  /** Present on assistant messages that triggered one or more tool calls. */
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id?: string;
  function: {
    name: string;
    /** Ollama returns objects here, OpenAI returns strings. We normalize. */
    arguments: Record<string, unknown>;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatStep {
  done: boolean;
  message: ChatMessage;
}

export class OllamaUnavailableError extends Error {
  constructor(message = "Ollama is not reachable") {
    super(message);
    this.name = "OllamaUnavailableError";
  }
}

interface ChatOptions {
  model?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  /** Lower = more deterministic. Default 0.4. */
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * Single non-streaming chat turn. Returns the assistant message including any
 * tool_calls the model decided to make. Use `chatStream` for token-by-token UX.
 */
export async function chat(opts: ChatOptions): Promise<ChatMessage> {
  const body = {
    model: opts.model ?? DEFAULT_MODEL,
    messages: opts.messages,
    tools: opts.tools,
    stream: false,
    options: { temperature: opts.temperature ?? 0.4 },
  };
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch {
    throw new OllamaUnavailableError();
  }
  if (!res.ok) {
    throw new Error(`Ollama chat failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { message: ChatMessage };
  return normalizeMessage(data.message);
}

/**
 * Streaming chat turn. Yields content deltas as they arrive, plus a final
 * complete message once the stream closes (which may include tool_calls).
 */
export async function* chatStream(
  opts: ChatOptions,
): AsyncGenerator<ChatStep, void, void> {
  const body = {
    model: opts.model ?? DEFAULT_MODEL,
    messages: opts.messages,
    tools: opts.tools,
    stream: true,
    options: { temperature: opts.temperature ?? 0.4 },
  };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch {
    throw new OllamaUnavailableError();
  }
  if (!res.ok || !res.body) {
    throw new Error(`Ollama chat failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  // Accumulators across the stream.
  const acc: ChatMessage = { role: "assistant", content: "" };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // Ollama sends NDJSON.
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let evt: { message?: ChatMessage; done?: boolean };
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }
      if (evt.message) {
        const norm = normalizeMessage(evt.message);
        if (norm.content) acc.content += norm.content;
        if (norm.tool_calls?.length) {
          acc.tool_calls = [...(acc.tool_calls ?? []), ...norm.tool_calls];
        }
        yield { done: false, message: norm };
      }
      if (evt.done) {
        yield { done: true, message: acc };
        return;
      }
    }
  }
  yield { done: true, message: acc };
}

/** Quick health check used to decide whether to even attempt agent runs. */
export async function isOllamaAvailable(timeoutMs = 1000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${BASE_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

function normalizeMessage(m: ChatMessage): ChatMessage {
  // Some Ollama versions return arguments as a string. Normalize to object.
  if (m.tool_calls) {
    m.tool_calls = m.tool_calls.map((tc) => {
      const args = tc.function?.arguments;
      let parsed: Record<string, unknown> = {};
      if (typeof args === "string") {
        try {
          parsed = JSON.parse(args);
        } catch {
          parsed = {};
        }
      } else if (args && typeof args === "object") {
        parsed = args;
      }
      return {
        id: tc.id,
        function: { name: tc.function.name, arguments: parsed },
      };
    });
  }
  return m;
}
