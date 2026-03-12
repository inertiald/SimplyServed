/**
 * aiService.ts
 *
 * Lightweight AI service that calls the LiteLLM proxy (OpenAI-compatible).
 * Replaces the deterministic MockBrain with a real LLM inference call.
 *
 * LiteLLM runs as a Docker service ("litellm") and maps the model name
 * "local-agent-model" to ollama/llama3.2 via litellm_config.yaml.
 *
 * Usage:
 *   import { generateAIResponse } from "@/lib/agent/aiService";
 *   const reply = await generateAIResponse([
 *     { role: "user", content: "I need a plumber" },
 *   ]);
 *
 * Optional environment variable:
 *   LITELLM_URL — override the default LiteLLM endpoint (defaults to http://litellm:4000)
 */

import type { ChatMessage } from "./types";

/** LiteLLM proxy endpoint — uses the Docker service hostname so the
 *  Next.js container can reach it inside the Docker network. */
const LITELLM_URL =
  process.env.LITELLM_URL ?? "http://litellm:4000";

/** System prompt injected as the first message in every conversation. */
const SYSTEM_PROMPT =
  "You are an AI assistant helping users find local services and providers. Respond clearly and helpfully.";

/** OpenAI-compatible response shape returned by LiteLLM. */
interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Sends the conversation history to the LiteLLM proxy and returns the generated text.
 *
 * The request is formatted as an OpenAI chat completion. LiteLLM forwards it
 * to ollama/llama3.2 running locally via the "local-agent-model" alias.
 *
 * @throws Error if the LiteLLM request fails or returns an unexpected shape.
 */
export async function generateAIResponse(
  conversationHistory: ChatMessage[]
): Promise<string> {
  // Basic input validation — guard against excessively long messages.
  const MAX_LENGTH = 4000;
  const safeConversationHistory = conversationHistory.map(({ role, content }) => ({
    role,
    content: content.length > MAX_LENGTH ? content.slice(0, MAX_LENGTH) : content,
  }));

  // POST to the LiteLLM OpenAI-compatible chat completions endpoint.
  const res = await fetch(`${LITELLM_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // "local-agent-model" is the model alias defined in litellm_config.yaml;
      // LiteLLM maps it to ollama/llama3.2 running in the local Docker network.
      model: "local-agent-model",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...safeConversationHistory,
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(
      `LiteLLM request failed: ${res.status} ${res.statusText}`
    );
  }

  // Parse the OpenAI-format response and extract the assistant's text.
  const data = (await res.json()) as ChatCompletionResponse;
  if (!data.choices?.length) {
    throw new Error("LiteLLM returned an empty choices array.");
  }
  return data.choices[0].message.content;
}
