import { NextResponse } from "next/server";
// AgentBrain replaces MockBrain — it uses an LLM via LiteLLM to detect intents
// instead of the old regex/heuristic approach.
import { AgentBrain } from "@/lib/agent";
// generateAIResponse provides a free-form AI reply when no tool intent
// is detected (e.g. general questions about local services).
import { generateAIResponse } from "@/lib/agent/aiService";
import { toolRegistry } from "@/lib/agent/tools";
import type {
  AgentRequest,
  AgentResponse,
  ChatMessage,
  ThinkingStep,
} from "@/lib/agent/types";

const brain = new AgentBrain();
const conversations = new Map<string, ChatMessage[]>();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AgentRequest;
    const { message, sessionId: providedSessionId } = body;
    const sessionId =
      typeof providedSessionId === "string" && providedSessionId.trim().length > 0
        ? providedSessionId
        : crypto.randomUUID();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "A non-empty 'message' string is required." },
        { status: 400 }
      );
    }

    const steps: ThinkingStep[] = [];
    const conversationHistory = [
      ...(conversations.get(sessionId) ?? []),
      { role: "user", content: message } satisfies ChatMessage,
    ];

    conversations.set(sessionId, conversationHistory);

    // Step 1 — Parse intents
    steps.push({ message: "Analyzing your request…", status: "done" });
    const toolCalls = await brain.parseIntents(conversationHistory);

    let reply: string;

    if (toolCalls.length === 0) {
      steps.push({
        message: "No actionable intents detected — asking Eleanor for a reply…",
        status: "done",
      });

      // No tool call was identified: fall back to a free-form AI response
      // so the user gets a helpful answer instead of a hardcoded fallback string.
      try {
        reply = await generateAIResponse(conversationHistory);
      } catch (err) {
        console.error("[agent/route] generateAIResponse failed:", err);
        reply =
          "I'm not sure what you'd like me to do. Try asking me to order a pizza or book a haircut!";
      }

      conversations.set(sessionId, [
        ...conversationHistory,
        { role: "assistant", content: reply },
      ]);

      const response: AgentResponse = {
        sessionId,
        reply,
        thinkingSteps: steps,
        toolCalls: [],
      };
      return NextResponse.json(response);
    }

    steps.push({
      message: `Identified ${toolCalls.length} intent(s).`,
      status: "done",
    });

    // Step 2 — Execute each tool
    for (const call of toolCalls) {
      const tool = toolRegistry[call.toolName];
      if (!tool) {
        steps.push({
          message: `Unknown tool: ${call.toolName}`,
          status: "error",
        });
        continue;
      }

      steps.push({
        message: `Calling ${tool.name}…`,
        status: "done",
      });

      const result = await tool.execute(call.params);
      call.result = result;

      steps.push({
        message: result.success
          ? `✅ ${result.summary}`
          : `❌ ${tool.name} failed.`,
        status: result.success ? "done" : "error",
      });
    }

    // Build final reply
    const summaries = toolCalls
      .filter((c) => c.result?.success)
      .map((c) => c.result!.summary);

    reply =
      summaries.length > 0
        ? `All done! ${summaries.join(" ")}`
        : "I tried but something went wrong with your requests.";

    conversations.set(sessionId, [
      ...conversationHistory,
      { role: "assistant", content: reply },
    ]);

    const response: AgentResponse = {
      sessionId,
      reply,
      thinkingSteps: steps,
      toolCalls,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
