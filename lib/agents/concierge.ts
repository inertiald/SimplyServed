/**
 * Concierge agent — consumer-facing.
 *
 * Tools the model can call:
 *   • search_listings — Postgres ILIKE search filtered to the user's H3 ring,
 *     so recommendations are actually local.
 *   • get_listing     — full description + provider for a chosen result.
 *   • draft_request   — drafts a booking blurb with fee preview the user can
 *     copy into the actual booking form. We *don't* let the agent place a
 *     real request; that requires the user's explicit click in the BookForm.
 */
import { prisma } from "@/lib/prisma";
import { neighborhoodCellsAround } from "@/lib/h3";
import { calculateFees } from "@/lib/payments";
import type { Agent, AgentTool } from "./runner";

const search_listings: AgentTool = {
  name: "search_listings",
  definition: {
    type: "function",
    function: {
      name: "search_listings",
      description:
        "Search for active service listings near the user. Returns up to 6 listings ranked by recency. Always call this before recommending anything.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Plain-language match against title/description (optional).",
          },
          category: {
            type: "string",
            description:
              "Optional category filter, e.g. 'Pet care', 'Tutoring', 'Repair & handywork'.",
          },
          max_hourly_rate: {
            type: "number",
            description: "Optional ceiling on hourly rate in USD.",
          },
        },
      },
    },
  },
  async run(args, ctx) {
    const cells = neighborhoodCellsAround(ctx.lat, ctx.lng, 2);
    const q = (args.query as string | undefined)?.trim();
    const category = args.category as string | undefined;
    const maxRate = args.max_hourly_rate as number | undefined;

    const listings = await prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        h3Neighborhood: { in: cells },
        ...(category ? { category } : {}),
        ...(typeof maxRate === "number" ? { hourlyRate: { lte: maxRate } } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { description: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { provider: { select: { name: true } } },
    });

    return listings.map((l) => ({
      id: l.id,
      title: l.title,
      category: l.category,
      hourlyRate: l.hourlyRate,
      provider: l.provider.name,
      // Trim description so the model isn't blown out by long text.
      description: l.description.slice(0, 280),
    }));
  },
  summarize(result) {
    const arr = result as unknown[];
    return `${arr.length} listing${arr.length === 1 ? "" : "s"} nearby`;
  },
};

const get_listing: AgentTool = {
  name: "get_listing",
  definition: {
    type: "function",
    function: {
      name: "get_listing",
      description: "Fetch full details for a specific listing by id.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Listing id from search_listings." },
        },
        required: ["id"],
      },
    },
  },
  async run(args) {
    const id = args.id as string;
    const l = await prisma.listing.findUnique({
      where: { id },
      include: { provider: { select: { name: true } } },
    });
    if (!l) return { error: "Listing not found" };
    return {
      id: l.id,
      title: l.title,
      category: l.category,
      hourlyRate: l.hourlyRate,
      provider: l.provider.name,
      description: l.description,
    };
  },
  summarize(result) {
    const r = result as { title?: string; error?: string };
    return r.error ?? r.title ?? "ok";
  },
};

const draft_request: AgentTool = {
  name: "draft_request",
  definition: {
    type: "function",
    function: {
      name: "draft_request",
      description:
        "Draft a service-request message and quote for a chosen listing. Does NOT place the request — the user still has to click 'Place request' in the booking form. Use this when the user has picked a listing and wants help phrasing their ask.",
      parameters: {
        type: "object",
        properties: {
          listing_id: { type: "string" },
          hours: { type: "number", description: "Estimated hours, default 1." },
          notes: {
            type: "string",
            description: "What the user wants done, in their own words.",
          },
        },
        required: ["listing_id"],
      },
    },
  },
  async run(args) {
    const id = args.listing_id as string;
    const hours = Math.max(1, Math.min(24, Number(args.hours ?? 1)));
    const listing = await prisma.listing.findUnique({
      where: { id },
      select: { id: true, title: true, hourlyRate: true },
    });
    if (!listing) return { error: "Listing not found" };
    const fees = calculateFees(listing.hourlyRate, hours);
    return {
      listingId: listing.id,
      title: listing.title,
      hours,
      notes: (args.notes as string | undefined) ?? "",
      quote: fees,
      bookingUrl: `/listings/${listing.id}`,
    };
  },
  summarize(result) {
    const r = result as { quote?: { total: number }; error?: string };
    return r.error ?? `quote $${r.quote?.total.toFixed(2)}`;
  },
};

export const conciergeAgent: Agent = {
  id: "concierge",
  label: "Concierge",
  temperature: 0.5,
  maxSteps: 4,
  tools: [search_listings, get_listing, draft_request],
  system: `You are SimplyServed's neighborhood Concierge — a warm, terse local guide that helps people book hyper-local services.

Operating rules:
- The user's location is already known to your tools; do not ask for it.
- When the user describes a need, ALWAYS call search_listings first before suggesting providers. Never invent listings.
- After tools run, give a short, friendly answer in 2–4 sentences. If you found listings, mention them by title and hourly rate, and end with a single suggestion ("want me to draft a request to X?").
- If search returns nothing, say so honestly and suggest they widen the criteria or post to the neighborhood feed.
- Never claim to have booked or paid anything — drafting a request is the most you can do; the user must confirm in the UI.
- Keep replies under ~80 words unless the user asks for detail. No bullet lists unless they help.`,
};
