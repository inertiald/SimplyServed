import type { AgentBrain, ToolCall } from "./types";

/**
 * MockBrain — uses regex / heuristics to simulate intent detection.
 *
 * Replace this with a real Vertex AI brain by implementing AgentBrain.
 */
export class MockBrain implements AgentBrain {
  async parseIntents(message: string): Promise<ToolCall[]> {
    const lower = message.toLowerCase();
    const calls: ToolCall[] = [];

    // Detect pizza intent
    if (/pizza/i.test(lower)) {
      const typeMatch = lower.match(
        /(?:a|one|an?)\s+(pepperoni|margherita|hawaiian|veggie|cheese)\s*pizza/i
      );
      calls.push({
        toolName: "orderPizza",
        params: { type: typeMatch ? typeMatch[1] : "Margherita" },
      });
    }

    // Detect haircut / salon intent
    if (/haircut|hair\s*cut|salon|barber/i.test(lower)) {
      const { date, time } = this.extractDateTime(lower);
      calls.push({
        toolName: "bookAppointment",
        params: { service: "Haircut", date, time },
      });
    }

    // Detect generic booking intent (plumber, cleaning, etc.)
    if (/book\s+(a\s+)?(plumber|cleaning|massage|dentist)/i.test(lower)) {
      const serviceMatch = lower.match(
        /book\s+(?:a\s+)?(plumber|cleaning|massage|dentist)/i
      );
      const service = serviceMatch ? serviceMatch[1] : "Service";
      const { date, time } = this.extractDateTime(lower);
      calls.push({
        toolName: "bookAppointment",
        params: {
          service: service.charAt(0).toUpperCase() + service.slice(1),
          date,
          time,
        },
      });
    }

    return calls;
  }

  /** Simple heuristic date/time extractor. */
  private extractDateTime(text: string): { date: string; time: string } {
    let date = "next available slot";
    let time = "";

    // Match day names
    const dayMatch = text.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    );
    if (dayMatch) {
      date = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1);
    }

    // Match "tomorrow", "today"
    if (/\btomorrow\b/i.test(text)) date = "Tomorrow";
    if (/\btoday\b/i.test(text)) date = "Today";

    // Match time like "10", "10am", "3:30 pm", "at 10"
    const timeMatch = text.match(
      /\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i
    );
    if (timeMatch) {
      time = timeMatch[1].trim();
    }

    return { date, time };
  }
}
