/**
 * Concierge agent — consumer-facing.
 *
 * Tools the model can call:
 *   • search_listings — Postgres ILIKE search filtered to the user's H3 ring,
 *     so recommendations are actually local. Matches title, description AND
 *     provider name so queries like "Priya Nair" surface her listings.
 *   • get_listing     — full description + provider for a chosen result.
 *   • draft_request   — drafts a booking blurb with fee preview the user can
 *     copy into the actual booking form. We *don't* let the agent place a
 *     real request; that requires the user's explicit click in the BookForm.
 *     Falls back to fuzzy title/provider-name lookup if the exact UUID is
 *     unavailable (handles small-model ID confusion gracefully).
 */
import { prisma } from "@/lib/prisma";
import { neighborhoodCellsAround } from "@/lib/h3";
import { calculateFees } from "@/lib/payments";
import type { Agent, AgentTool } from "./runner";

const DEMO_FALLBACK_COORDS = { lat: 37.7749, lng: -122.4194 };

function searchBaseWhere(args: Record<string, unknown>) {
  const category = args.category as string | undefined;
  const maxRate = args.max_hourly_rate as number | undefined;
  return {
    status: "ACTIVE" as const,
    ...(category ? { category } : {}),
    ...(typeof maxRate === "number" ? { hourlyRate: { lte: maxRate } } : {}),
  };
}

/**
 * Build the text-search OR clause.  Unlike the previous version this now
 * also matches the provider's display name — so a query like "Priya Nair"
 * will surface her listings even if her name isn't in title/description.
 */
function queryTextWhere(query: string | undefined) {
  if (!query) return {};
  return {
    OR: [
      { title: { contains: query, mode: "insensitive" as const } },
      { description: { contains: query, mode: "insensitive" as const } },
      { provider: { name: { contains: query, mode: "insensitive" as const } } },
    ],
  };
}

function rankByDistance<T extends { lat: number; lng: number }>(
  items: T[],
  lat: number,
  lng: number,
) {
  const score = (p: { lat: number; lng: number }) => {
    const dLat = p.lat - lat;
    const dLng = p.lng - lng;
    return dLat * dLat + dLng * dLng;
  };
  return [...items].sort((a, b) => score(a) - score(b));
}

/**
 * Attempt to resolve a listing by UUID, then fall back to fuzzy title or
 * provider-name match.  This handles small-model confusion where llama 3.2
 * sometimes passes a provider name or sequential number instead of the UUID.
 */
async function resolveListing(raw: string) {
  // 1. Exact UUID lookup (the happy path).
  const byId = await prisma.listing.findUnique({
    where: { id: raw },
    select: { id: true, title: true, hourlyRate: true },
  });
  if (byId) return byId;

  // 2. Fuzzy fallback — match title or provider name.
  const term = raw.trim();
  if (!term) return null;
  return prisma.listing.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { provider: { name: { contains: term, mode: "insensitive" } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, hourlyRate: true },
  });
}

const search_listings: AgentTool = {
  name: "search_listings",
  definition: {
    type: "function",
    function: {
      name: "search_listings",
      description:
        "Search for active service listings near the user. Returns up to 6 results. Each result has an `id` (UUID) — copy that exact value when calling get_listing or draft_request. Always call this first before recommending or drafting anything.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Plain-language match against listing title, description, or provider name (optional). To find a specific provider, pass their name here.",
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
    const q = (args.query as string | undefined)?.trim();
    const startedAt = Date.now();

    try {
      const localCells = neighborhoodCellsAround(ctx.lat, ctx.lng, 2);
      const demoCells = neighborhoodCellsAround(
        DEMO_FALLBACK_COORDS.lat,
        DEMO_FALLBACK_COORDS.lng,
        3,
      );
      const baseWhere = searchBaseWhere(args);

      const runQuery = async (opts: {
        localOnly: boolean;
        withQuery: boolean;
        limit: number;
      }) =>
        prisma.listing.findMany({
          where: {
            ...baseWhere,
            ...(opts.localOnly
              ? { h3Neighborhood: { in: localCells } }
              : {
                  OR: [
                    { h3Neighborhood: { in: localCells } },
                    { h3Neighborhood: { in: demoCells } },
                  ],
                }),
            ...(opts.withQuery ? queryTextWhere(q) : {}),
          },
          orderBy: { createdAt: "desc" },
          take: opts.limit,
          select: {
            id: true,
            title: true,
            category: true,
            hourlyRate: true,
            description: true,
            lat: true,
            lng: true,
            provider: { select: { name: true } },
          },
        });

      let strategy = "local+query";
      let listings = await runQuery({ localOnly: true, withQuery: true, limit: 6 });

      if (listings.length === 0 && q) {
        strategy = "local+relaxed_query";
        listings = await runQuery({ localOnly: true, withQuery: false, limit: 6 });
      }

      if (listings.length === 0) {
        strategy = q ? "regional+query" : "regional";
        const regional = await runQuery({ localOnly: false, withQuery: !!q, limit: 24 });
        listings = rankByDistance(regional, ctx.lat, ctx.lng).slice(0, 6);
      }

      if (listings.length === 0 && q) {
        strategy = "regional+relaxed_query";
        const regional = await runQuery({
          localOnly: false,
          withQuery: false,
          limit: 24,
        });
        listings = rankByDistance(regional, ctx.lat, ctx.lng).slice(0, 6);
      }

      console.info(
        JSON.stringify({
          kind: "concierge.search_listings",
          durationMs: Date.now() - startedAt,
          strategy,
          resultCount: listings.length,
          hasQuery: Boolean(q),
          hasCategory: Boolean(args.category),
          hasMaxRate: typeof args.max_hourly_rate === "number",
          localCellCount: localCells.length,
        }),
      );

      return listings.map((l) => ({
        // NOTE: `id` is the UUID you must pass verbatim to get_listing / draft_request.
        id: l.id,
        title: l.title,
        category: l.category,
        hourlyRate: l.hourlyRate,
        provider: l.provider.name,
        // Trim description so the model isn't blown out by long text.
        description: l.description.slice(0, 280),
      }));
    } catch (err) {
      console.error(
        JSON.stringify({
          kind: "concierge.search_listings.error",
          durationMs: Date.now() - startedAt,
          error: (err as Error).message,
        }),
      );
      return [];
    }
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
      description:
        "Fetch full details for a specific listing. Pass the exact `id` UUID from search_listings.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The exact listing `id` UUID returned by search_listings.",
          },
        },
        required: ["id"],
      },
    },
  },
  async run(args) {
    const id = (args.id as string | undefined)?.trim() ?? "";
    try {
      const l = await resolveListing(id);
      if (!l) return { error: "Listing not found. Call search_listings first and pass the exact `id` value from those results." };
      // Reload with full fields if we only have a stub from resolveListing.
      const full = await prisma.listing.findUnique({
        where: { id: l.id },
        select: {
          id: true,
          title: true,
          category: true,
          hourlyRate: true,
          description: true,
          provider: { select: { name: true } },
        },
      });
      if (!full) return { error: "Listing details are temporarily unavailable." };
      return {
        id: full.id,
        title: full.title,
        category: full.category,
        hourlyRate: full.hourlyRate,
        provider: full.provider.name,
        description: full.description,
      };
    } catch (err) {
      console.error(
        JSON.stringify({
          kind: "concierge.get_listing.error",
          listingId: id,
          error: (err as Error).message,
        }),
      );
      return { error: "Listing details are temporarily unavailable." };
    }
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
        "Draft a service-request message and fee quote for a chosen listing. Does NOT place the request — the user still has to click 'Place request' in the booking form. Use this when the user has picked a listing. Pass the exact `id` UUID from search_listings as listing_id.",
      parameters: {
        type: "object",
        properties: {
          listing_id: {
            type: "string",
            description: "The exact listing `id` UUID from search_listings.",
          },
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
    const raw = (args.listing_id as string | undefined)?.trim() ?? "";
    const hours = Math.max(1, Math.min(24, Number(args.hours ?? 1)));

    const listing = await resolveListing(raw);
    if (!listing) {
      return {
        error:
          "Listing not found. Please call search_listings first and use the exact `id` value from those results.",
      };
    }

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
  temperature: 0.4,
  maxSteps: 6,
  tools: [search_listings, get_listing, draft_request],
  system: `You are SimplyServed's neighborhood Concierge — a warm, efficient local guide that helps people find and book hyper-local services.

Core rules:
1. ALWAYS call search_listings before recommending, naming, or drafting for any provider. Never invent listing IDs or providers.
2. When the user names a provider (e.g. "Priya Nair"), call search_listings with that name as the query parameter.
3. When calling get_listing or draft_request, you MUST pass the exact "id" UUID string from the search_listings result — do not use sequential numbers, provider names, or modified values.
4. If you need to draft a request for a listing, pass its exact "id" from search_listings as the listing_id argument to draft_request.
5. If search_listings returns empty, say so honestly and suggest widening criteria or posting to the neighborhood feed.

Response style:
- After finding listings, give a 2–4 sentence friendly summary mentioning titles and rates.
- End with one concrete suggestion: "Want me to draft a request to [title]?"
- Never claim to have booked, paid, or confirmed anything — drafting is the furthest you can go; the user must click in the UI.
- Keep replies under ~80 words unless the user asks for detail.`,
};
