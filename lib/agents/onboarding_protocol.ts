export type OnboardingAgentId = "onboarding";

export interface UserTurnMessage {
  type: "user_turn";
  agent: OnboardingAgentId;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  lat?: number;
  lng?: number;
}

export interface PingMessage {
  type: "ping";
}

export type OnboardingClientMessage = UserTurnMessage | PingMessage;

export type OnboardingStepEvent =
  | { type: "thought"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; summary: string; data?: unknown }
  | { type: "tool_error"; name: string; error: string };

export type OnboardingServerMessage =
  | { type: "ready"; reconnect: boolean }
  | { type: "step"; event: OnboardingStepEvent }
  | { type: "token"; text: string }
  | { type: "done"; content: string }
  | { type: "error"; error: string; code?: "UNAUTHORIZED" | "RATE_LIMITED" | "BAD_REQUEST" };

export function parseClientMessage(raw: string): OnboardingClientMessage | null {
  try {
    const data = JSON.parse(raw) as Partial<OnboardingClientMessage>;
    if (data.type === "ping") return { type: "ping" };
    if (
      data.type === "user_turn" &&
      data.agent === "onboarding" &&
      typeof data.message === "string"
    ) {
      return {
        type: "user_turn",
        agent: "onboarding",
        message: data.message,
        history: Array.isArray(data.history)
          ? data.history
              .filter(
                (m) =>
                  m &&
                  (m.role === "user" || m.role === "assistant") &&
                  typeof m.content === "string",
              )
              .slice(-10)
          : undefined,
        lat: typeof data.lat === "number" ? data.lat : undefined,
        lng: typeof data.lng === "number" ? data.lng : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}
