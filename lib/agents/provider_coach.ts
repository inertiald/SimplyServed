/**
 * Provider Coach agent — provider-facing.
 *
 * Helps a provider:
 *   • suggest_price   — looks at comparable listings nearby and proposes a rate.
 *   • draft_listing   — turns a one-line idea into a full title + description
 *                       + category + hourly rate, ready to paste into the form.
 *   • draft_offer     — drafts a coupon-style offer post for an existing listing.
 *
 * The agent never *creates* anything itself — it always returns a proposed
 * draft and lets the human commit via the existing UI.
 */
import { prisma } from "@/lib/prisma";
import { neighborhoodCellsAround } from "@/lib/h3";
import type { Agent, AgentTool } from "./runner";

const CATEGORIES = [
  "Home services",
  "Beauty & wellness",
  "Tutoring",
  "Pet care",
  "Food & catering",
  "Fitness",
  "Repair & handywork",
  "Creative",
  "Tech help",
  "Events",
];

const suggest_price: AgentTool = {
  name: "suggest_price",
  definition: {
    type: "function",
    function: {
      name: "suggest_price",
      description:
        "Look at comparable nearby listings to suggest an hourly rate range. Call this before drafting a listing.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: `One of: ${CATEGORIES.join(", ")}.`,
          },
        },
        required: ["category"],
      },
    },
  },
  async run(args, ctx) {
    const cells = neighborhoodCellsAround(ctx.lat, ctx.lng, 3);
    const rows = await prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        category: args.category as string,
        h3Neighborhood: { in: cells },
      },
      select: { hourlyRate: true, title: true },
      take: 30,
    });
    if (rows.length === 0) {
      return {
        comps: 0,
        message: "No nearby comps yet — you're a pioneer in this category.",
      };
    }
    const rates = rows.map((r) => r.hourlyRate).sort((a, b) => a - b);
    const median = rates[Math.floor(rates.length / 2)];
    const p25 = rates[Math.floor(rates.length * 0.25)];
    const p75 = rates[Math.floor(rates.length * 0.75)];
    return {
      comps: rates.length,
      median,
      lowEnd: p25,
      highEnd: p75,
      sample: rows.slice(0, 4).map((r) => r.title),
    };
  },
  summarize(result) {
    const r = result as { median?: number; comps: number };
    return r.median != null
      ? `median $${r.median}/hr (${r.comps} comps)`
      : `${r.comps} comps`;
  },
};

const draft_listing: AgentTool = {
  name: "draft_listing",
  definition: {
    type: "function",
    function: {
      name: "draft_listing",
      description:
        "Produce a polished listing draft from a one-line idea. Returns title, description, category, and hourly rate. The human will paste it into the listing form.",
      parameters: {
        type: "object",
        properties: {
          idea: { type: "string", description: "The provider's one-line description." },
          category: {
            type: "string",
            description: `One of: ${CATEGORIES.join(", ")}.`,
          },
          hourly_rate: {
            type: "number",
            description: "Recommended hourly rate in USD.",
          },
          title: { type: "string" },
          description: {
            type: "string",
            description:
              "2–4 sentence listing description in first person, warm and concrete.",
          },
        },
        required: ["title", "description", "category", "hourly_rate"],
      },
    },
  },
  // This is a "structured-output" tool: the model fills in the args, and we
  // simply echo them back. That's the cleanest way to coerce small models into
  // emitting a structured form.
  async run(args) {
    return {
      title: String(args.title ?? "").slice(0, 120),
      description: String(args.description ?? "").slice(0, 1500),
      category: CATEGORIES.includes(args.category as string)
        ? (args.category as string)
        : "Home services",
      hourlyRate: Math.max(1, Math.min(10_000, Number(args.hourly_rate ?? 50))),
    };
  },
  summarize(result) {
    const r = result as { title: string; hourlyRate: number };
    return `“${r.title}” @ $${r.hourlyRate}/hr`;
  },
};

const draft_offer: AgentTool = {
  name: "draft_offer",
  definition: {
    type: "function",
    function: {
      name: "draft_offer",
      description:
        "Draft a coupon-style offer post for one of the provider's existing listings. Returns post text and offer metadata.",
      parameters: {
        type: "object",
        properties: {
          listing_id: { type: "string" },
          discount: {
            type: "string",
            description: "Discount headline, e.g. '20% off' or 'Buy 1 get 1'.",
          },
          code: {
            type: "string",
            description: "Short uppercase coupon code, max 12 chars.",
          },
          expires_in_days: {
            type: "number",
            description: "Days from today the offer is valid.",
          },
          contentText: {
            type: "string",
            description: "1–2 sentence neighborhood-style post body.",
          },
        },
        required: ["listing_id", "discount", "code", "contentText"],
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.userId) return { error: "Sign in required" };
    const listing = await prisma.listing.findFirst({
      where: { id: args.listing_id as string, providerId: ctx.userId },
      select: { id: true, title: true },
    });
    if (!listing) return { error: "That listing isn't yours." };
    const days = Math.max(1, Math.min(60, Number(args.expires_in_days ?? 7)));
    return {
      listingId: listing.id,
      contentText: String(args.contentText ?? "").slice(0, 1000),
      offer: {
        code: String(args.code ?? "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 12) || "DEAL",
        discount: String(args.discount ?? "Special offer").slice(0, 60),
        expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
      },
    };
  },
  summarize(result) {
    const r = result as { offer?: { code?: string }; error?: string };
    return r.error ?? `offer ${r.offer?.code ?? ""}`;
  },
};

export const providerCoachAgent: Agent = {
  id: "provider_coach",
  label: "Provider Coach",
  temperature: 0.6,
  maxSteps: 4,
  tools: [suggest_price, draft_listing, draft_offer],
  system: `You are SimplyServed's Provider Coach — a brisk, encouraging operator who helps neighborhood service providers package what they do.

Rules:
- When asked to write a listing, FIRST call suggest_price for the right category, THEN call draft_listing using the median (or close to it) as the hourly rate.
- For an offer, call draft_offer once and then summarize what you produced.
- Replies are short and concrete: 2–3 sentences max. If you produced a draft, end with: "Open the form to publish — you can still edit anything."
- Never claim to have published anything; you only produce drafts.
- Available categories: ${CATEGORIES.join(", ")}.`,
};
