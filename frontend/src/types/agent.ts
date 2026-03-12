/** Result returned after a tool executes. */
export interface ToolResult {
  success: boolean;
  service: string;
  provider: string;
  summary: string;
  details: Record<string, string>;
}

/** A single tool call the agent decides to make. */
export interface ToolCall {
  toolName: string;
  params: Record<string, string>;
  result?: ToolResult;
}

/** A thinking step shown to the user. */
export interface ThinkingStep {
  message: string;
  status: "pending" | "running" | "done" | "error";
}

/** The full response from the agent API. */
export interface AgentResponse {
  sessionId: string;
  reply: string;
  thinkingSteps: ThinkingStep[];
  toolCalls: ToolCall[];
}

/** Request body sent to the agent API. */
export interface AgentRequest {
  message: string;
  sessionId?: string;
}
