/**
 * aiService.ts
 *
 * Lightweight AI service that wraps the Google Gemini API.
 * Replaces the deterministic MockBrain with a real LLM inference call.
 *
 * Usage:
 *   import { generateAIResponse } from "@/lib/agent/aiService";
 *   const reply = await generateAIResponse("I need a plumber");
 *
 * Required environment variable:
 *   GEMINI_API_KEY — your Google Gemini API key
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

/** System prompt injected before every user message. */
const SYSTEM_PROMPT =
  "You are an AI assistant helping users find local services and providers. Respond clearly and helpfully.";

/**
 * Sends `userMessage` to the Gemini API and returns the generated text.
 *
 * Validates message length before sending to avoid unexpected API behaviour
 * with extremely long inputs.
 *
 * @throws Error if GEMINI_API_KEY is not set or the API call fails.
 */
export async function generateAIResponse(userMessage: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not set. " +
        "Add it to your .env.local file before using the Gemini integration."
    );
  }

  // Basic input validation — guard against excessively long messages.
  const MAX_LENGTH = 4000;
  const safeMessage =
    userMessage.length > MAX_LENGTH
      ? userMessage.slice(0, MAX_LENGTH)
      : userMessage;

  // Initialise the Gemini client with the API key from the environment.
  const genAI = new GoogleGenerativeAI(apiKey);

  // Use gemini-1.5-flash for fast, cost-effective inference.
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // Build a chat-style prompt: system instruction followed by the user message.
  const result = await model.generateContent(
    `${SYSTEM_PROMPT}\n\nUser: ${safeMessage}`
  );

  return result.response.text();
}
