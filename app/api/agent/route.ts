import { NextResponse } from "next/server";
import { MockBrain } from "@/lib/agent/mock-brain";
import { toolRegistry } from "@/lib/agent/tools";
import type { AgentRequest, AgentResponse, ThinkingStep } from "@/lib/agent/types";

const brain = new MockBrain();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AgentRequest;
    const { message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "A non-empty 'message' string is required." },
        { status: 400 }
      );
    }

    const steps: ThinkingStep[] = [];

    // Step 1 — Parse intents
    steps.push({ message: "Analyzing your request…", status: "done" });
    const toolCalls = await brain.parseIntents(message);

    if (toolCalls.length === 0) {
      steps.push({
        message: "No actionable intents detected.",
        status: "done",
      });

      const response: AgentResponse = {
        reply:
          "I'm not sure what you'd like me to do. Try asking me to order a pizza or book a haircut!",
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

    const reply =
      summaries.length > 0
        ? `All done! ${summaries.join(" ")}`
        : "I tried but something went wrong with your requests.";

    const response: AgentResponse = {
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
