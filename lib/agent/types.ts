/** Represents a single tool available to the agent. */
export interface ToolDefinition {
  name: string;
  description: string;
  execute: (params: Record<string, string>) => Promise<ToolResult>;
}

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
  reply: string;
  thinkingSteps: ThinkingStep[];
  toolCalls: ToolCall[];
}

/** Request body sent to the agent API. */
export interface AgentRequest {
  message: string;
}

/**
 * Interface for any "brain" that parses user intent.
 * Swap MockBrain for a real Vertex AI implementation later.
 */
export interface AgentBrain {
  parseIntents(message: string): Promise<ToolCall[]>;
}
