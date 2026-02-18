import type { ToolDefinition, ToolResult } from "./types";

// ---------------------------------------------------------------------------
// Tool: Order Pizza
// ---------------------------------------------------------------------------
async function orderPizza(
  params: Record<string, string>
): Promise<ToolResult> {
  // Simulate a short delay like a real API call
  await new Promise((r) => setTimeout(r, 400));

  const type = params.type || "Margherita";
  return {
    success: true,
    service: "Pizza Order",
    provider: "Everett Pizza Co.",
    summary: `Your ${type} pizza has been ordered!`,
    details: {
      item: `${type} Pizza`,
      total: "$22.45",
      eta: "30-40 minutes",
      confirmationId: `PZ-${Date.now().toString(36).toUpperCase()}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: Book Appointment (haircut, plumber, etc.)
// ---------------------------------------------------------------------------
async function bookAppointment(
  params: Record<string, string>
): Promise<ToolResult> {
  await new Promise((r) => setTimeout(r, 400));

  const service = params.service || "Haircut";
  const date = params.date || "next available slot";
  const time = params.time || "";
  const when = time ? `${date} at ${time}` : date;

  return {
    success: true,
    service: `${service} Booking`,
    provider: "StyleCuts Salon",
    summary: `Your ${service.toLowerCase()} has been booked for ${when}.`,
    details: {
      appointment: service,
      scheduledFor: when,
      confirmationId: `BK-${Date.now().toString(36).toUpperCase()}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Tool Registry
// ---------------------------------------------------------------------------
export const toolRegistry: Record<string, ToolDefinition> = {
  orderPizza: {
    name: "orderPizza",
    description: "Order a pizza from a local provider.",
    execute: orderPizza,
  },
  bookAppointment: {
    name: "bookAppointment",
    description:
      "Book an appointment for services like haircuts, plumbers, etc.",
    execute: bookAppointment,
  },
};
