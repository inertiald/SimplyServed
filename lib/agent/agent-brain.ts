/**
 * agent-brain.ts
 *
 * AgentBrain — LLM-backed intent parser using the LiteLLM proxy.
 *
 * Implements the AgentBrain interface so it can be swapped in wherever
 * MockBrain was used without changing the rest of the system.
 *
 * How it works:
 *   1. The user message is sent to the LiteLLM proxy (OpenAI-compatible)
 *      with a structured prompt that instructs the model to output a JSON
 *      array of tool calls.
 *   2. LiteLLM maps the "local-agent-model" alias to ollama/llama3.2.
 *   3. If the model detects an actionable intent it returns one or more
 *      ToolCall objects (e.g. orderPizza, bookAppointment).
 *   4. If no intent is found it returns an empty array ([]).
 *   5. If the JSON cannot be parsed (model returned free text instead of
 *      JSON), an empty array is returned and the caller falls back to
 *      generateAIResponse() for a helpful reply.
 */

import type {
  AgentBrain as AgentBrainContract,
  ChatMessage,
  ToolCall,
} from "./types";

/** LiteLLM proxy endpoint — uses the Docker service hostname so the
 *  Next.js container can reach it inside the Docker network. */
const LITELLM_URL = process.env.LITELLM_URL ?? "http://litellm:4000";

/** System prompt that tells the model to output structured JSON tool calls. */
const INTENT_SYSTEM_PROMPT = `You are an intent-detection engine for a local services app.
Given the conversation so far, decide which tools (if any) should be called for the latest user request.
Use earlier user messages to fill in missing context like location, service type, date, or preferences.

Available tools:
- orderPizza  : params { type: string }   — order a pizza
- bookAppointment : params { service: string, date: string, time: string } — book a local service appointment

Rules:
1. Reply ONLY with a valid JSON array — no markdown, no explanation.
2. If no tool is needed return an empty array: []
3. For bookAppointment, derive service/date/time from the message; use "next available slot" when date is not mentioned and "not specified" when time is not mentioned.

Examples:
User: "I want a pepperoni pizza"
Response: [{"toolName":"orderPizza","params":{"type":"pepperoni"}}]

User: "Book a plumber for tomorrow at 3pm"
Response: [{"toolName":"bookAppointment","params":{"service":"Plumber","date":"Tomorrow","time":"3pm"}}]

User: "What is the weather?"
Response: []`;

/** OpenAI-compatible response shape returned by LiteLLM. */
interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class AgentBrain implements AgentBrainContract {
  /**
   * Uses the LiteLLM proxy to detect actionable intents in the conversation.
   * Returns an empty array when no intent is found or the request fails.
   */
  async parseIntents(conversationHistory: ChatMessage[]): Promise<ToolCall[]> {
    try {
      // POST to the LiteLLM OpenAI-compatible endpoint.
      // "local-agent-model" is mapped to ollama/llama3.2 in litellm_config.yaml.
      const res = await fetch(`${LITELLM_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // "local-agent-model" is the model alias defined in litellm_config.yaml;
          // LiteLLM maps it to ollama/llama3.2 running in the local Docker network.
          model: "local-agent-model",
          messages: [
            { role: "system", content: INTENT_SYSTEM_PROMPT },
            ...conversationHistory,
          ],
        }),
      });

      if (!res.ok) {
        console.error(
          `[AgentBrain] LiteLLM request failed: ${res.status} ${res.statusText}`
        );
        return [];
      }

      // Parse the OpenAI-format response.
      const data = (await res.json()) as ChatCompletionResponse;
      if (!data.choices?.length) {
        console.error("[AgentBrain] LiteLLM returned an empty choices array.");
        return [];
      }
      const raw = data.choices[0].message.content.trim();

      // Strip optional markdown fences the model sometimes adds.
      const jsonText = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```$/, "")
        .trim();

      // Validate the response looks like a JSON array before parsing
      // to catch cases where the model returned free text instead of JSON.
      if (!jsonText.startsWith("[")) {
        console.warn(
          "[AgentBrain] Unexpected non-array response:",
          jsonText.slice(0, 100)
        );
        return [];
      }

      const parsed = JSON.parse(jsonText) as ToolCall[];

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed;
    } catch (err) {
      // Log the error but do not crash — the route will use generateAIResponse()
      // to produce a helpful free-form reply for the user.
      console.error("[AgentBrain] Intent parsing failed:", err);
      return [];
    }
  }
}
