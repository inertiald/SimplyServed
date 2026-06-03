/**
 * Multi-agent runner.
 *
 * Each `Agent` is just (a) a system prompt, (b) a list of tool definitions
 * the model can call, and (c) the implementations for those tools. The runner
 * drives the chat-with-tools loop and emits a stream of structured events
 * suitable for forwarding to a browser as Server-Sent Events.
 *
 * Why roll our own:
 *   - Keeps the dep tree to zero new packages.
 *   - Gives us total control over the event taxonomy (`thought`, `tool`,
 *     `tool_result`, `token`, `done`, `error`) which is what the chat UI
 *     renders inline so users see the agent thinking out loud.
 *   - Same loop drives both the consumer "Concierge" agent and the provider
 *     "Coach" agent — they only differ in prompt + tools.
 */
import "server-only";
import {
  chat,
  chatStream,
  isOllamaAvailable,
  OllamaUnavailableError,
  type ChatMessage,
  type ToolCall,
  type ToolDefinition,
} from "@/lib/ollama";

export interface AgentTool {
  /** Must match `definition.function.name`. */
  name: string;
  definition: ToolDefinition;
  /**
   * Implementation. Throwing is fine — the runner catches and feeds the error
   * back to the model so it can recover. Return a structured object — it's
   * JSON-stringified for the model and surfaced separately to the UI.
   */
  run: (args: Record<string, unknown>, ctx: AgentContext) => Promise<unknown>;
  /**
   * Optional: short human-readable summary of a tool result for the UI
   * progress strip. Defaults to a generic "done" badge.
   */
  summarize?: (result: unknown) => string;
}

export interface AgentContext {
  userId: string | null;
  /** Approximate user location (set client-side from geolocation). */
  lat: number;
  lng: number;
}

export interface Agent {
  id: string;
  label: string;
  system: string;
  tools: AgentTool[];
  /** Defaults to 0.4 in lib/ollama.ts. */
  temperature?: number;
  /** Hard cap on tool-calling rounds before forcing a final answer. */
  maxSteps?: number;
}

/** Events emitted to the SSE stream. */
export type AgentEvent =
  | { type: "thought"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; summary: string; data?: unknown }
  | { type: "tool_error"; name: string; error: string }
  | { type: "token"; text: string }
  | { type: "done"; content: string }
  | { type: "error"; error: string };

/**
 * Run an agent against a user message, yielding events. Caller is responsible
 * for forwarding to the wire (SSE, websocket, whatever).
 */
export async function* runAgent(params: {
  agent: Agent;
  ctx: AgentContext;
  history: ChatMessage[];
  userMessage: string;
  signal?: AbortSignal;
}): AsyncGenerator<AgentEvent, void, void> {
  const { agent, ctx, history, userMessage, signal } = params;

  // Health check up-front so we can give a friendly error.
  if (!(await isOllamaAvailable())) {
    yield {
      type: "error",
      error:
        "The local AI model isn't reachable. Bring it up with `docker compose up ollama` (or set OLLAMA_URL).",
    };
    return;
  }

  const toolDefs = agent.tools.map((t) => t.definition);
  const toolByName = new Map(agent.tools.map((t) => [t.name, t]));

  const messages: ChatMessage[] = [
    { role: "system", content: agent.system },
    ...history,
    { role: "user", content: userMessage },
  ];

  const maxSteps = agent.maxSteps ?? 4;

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) return;

    // Tool-selection rounds are non-streaming — they return either a final
    // textual answer or one or more tool calls. Streaming tokens here would
    // render half-baked tool-call JSON to the user.
    let assistant: ChatMessage;
    try {
      assistant = await chat({
        messages,
        tools: toolDefs,
        temperature: agent.temperature,
        signal,
      });
    } catch (err) {
      if (err instanceof OllamaUnavailableError) {
        yield { type: "error", error: "AI model went offline mid-turn." };
        return;
      }
      yield { type: "error", error: (err as Error).message };
      return;
    }

    const calls = assistant.tool_calls ?? [];

    if (calls.length === 0) {
      // No tools requested. If the model already produced a final answer in
      // `assistant.content`, stream it back so the UI animates instead of
      // popping in.
      const content = assistant.content?.trim() ?? "";
      if (content) {
        for (const chunk of chunkText(content, 24)) {
          yield { type: "token", text: chunk };
        }
        yield { type: "done", content };
        return;
      }

      // Empty assistant turn — re-ask without tools and stream tokens for real.
      messages.push({
        role: "user",
        content:
          "Please answer my last message in plain text. Do not call any tools.",
      });
      let finalText = "";
      try {
        for await (const step of chatStream({
          messages,
          temperature: agent.temperature,
          signal,
        })) {
          if (!step.done && step.message.content) {
            yield { type: "token", text: step.message.content };
            finalText += step.message.content;
          }
        }
      } catch (err) {
        yield { type: "error", error: (err as Error).message };
        return;
      }
      yield { type: "done", content: finalText };
      return;
    }

    // The model wants to call one or more tools. If it also produced thinking
    // content alongside, surface it.
    if (assistant.content?.trim()) {
      yield { type: "thought", text: assistant.content.trim() };
    }
    messages.push({
      role: "assistant",
      content: assistant.content ?? "",
      tool_calls: calls,
    });

    for (const call of calls) {
      const tool = toolByName.get(call.function.name);
      yield {
        type: "tool",
        name: call.function.name,
        args: call.function.arguments,
      };
      if (!tool) {
        const err = `Unknown tool: ${call.function.name}`;
        yield { type: "tool_error", name: call.function.name, error: err };
        messages.push(makeToolMessage(call, { error: err }));
        continue;
      }
      try {
        const result = await tool.run(call.function.arguments, ctx);
        const summary = tool.summarize?.(result) ?? "done";
        yield { type: "tool_result", name: tool.name, summary, data: result };
        messages.push(makeToolMessage(call, result));
      } catch (err) {
        const msg = (err as Error).message;
        yield { type: "tool_error", name: tool.name, error: msg };
        messages.push(makeToolMessage(call, { error: msg }));
      }
    }
    // Loop back; the model now has tool outputs and should produce an answer.
  }

  yield {
    type: "error",
    error: `Agent gave up after ${maxSteps} tool rounds without answering.`,
  };
}

function makeToolMessage(call: ToolCall, result: unknown): ChatMessage {
  return {
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify(result),
  };
}

function chunkText(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}
