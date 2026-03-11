/**
 * gemini-brain.ts
 *
 * GeminiBrain — replaces MockBrain with a real Gemini-backed intent parser.
 *
 * Implements the AgentBrain interface so it can be swapped in wherever
 * MockBrain was used without changing the rest of the system.
 *
 * How it works:
 *   1. The user message is sent to Gemini with a structured prompt that
 *      instructs the model to output a JSON array of tool calls.
 *   2. If the model detects an actionable intent it returns one or more
 *      ToolCall objects (e.g. orderPizza, bookAppointment).
 *   3. If no intent is found it returns an empty array ([]).
 *   4. If the JSON cannot be parsed (model hallucinated free text instead
 *      of JSON), an empty array is returned and the caller falls back to
 *      generateAIResponse() for a helpful reply.
 */

import type { AgentBrain, ToolCall } from "./types";
import { GoogleGenerativeAI } from "@google/generative-ai";

/** Prompt that tells Gemini to output structured JSON tool calls. */
const INTENT_PROMPT = `You are an intent-detection engine for a local services app.
Given a user message, decide which tools (if any) should be called.

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
Response: []

Now parse this message:
`;

export class GeminiBrain implements AgentBrain {
  /**
   * Uses Gemini to detect actionable intents in the user message.
   * Returns an empty array when no intent is found or the API call fails.
   */
  async parseIntents(message: string): Promise<ToolCall[]> {
    const apiKey = process.env.GEMINI_API_KEY;

    // If no API key is configured, fall back silently to no-intent so the
    // route handler can surface a helpful Gemini text reply instead.
    if (!apiKey) {
      console.warn(
        "[GeminiBrain] GEMINI_API_KEY not set — skipping intent parsing."
      );
      return [];
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const result = await model.generateContent(
        `${INTENT_PROMPT}"${message}"`
      );
      const raw = result.response.text().trim();

      // Strip optional markdown fences the model sometimes adds.
      const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();

      // Validate the response looks like a JSON array before parsing
      // to catch cases where the model returned free text instead of JSON.
      if (!jsonText.startsWith("[")) {
        console.warn("[GeminiBrain] Unexpected non-array response:", jsonText.slice(0, 100));
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
      console.error("[GeminiBrain] Intent parsing failed:", err);
      return [];
    }
  }
}
