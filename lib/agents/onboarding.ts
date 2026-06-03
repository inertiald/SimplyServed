import { prisma } from "@/lib/prisma";
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

const collect_business_basics: AgentTool = {
  name: "collect_business_basics",
  definition: {
    type: "function",
    function: {
      name: "collect_business_basics",
      description:
        "Collect core onboarding details for a provider business profile draft.",
      parameters: {
        type: "object",
        properties: {
          business_name: { type: "string" },
          owner_name: { type: "string" },
          phone: { type: "string" },
          service_summary: { type: "string" },
        },
        required: ["business_name", "service_summary"],
      },
    },
  },
  async run(args) {
    return {
      businessName: String(args.business_name ?? "").slice(0, 120),
      ownerName: String(args.owner_name ?? "").slice(0, 120),
      phone: String(args.phone ?? "")
        .replace(/[^\d+()\-\s]/g, "")
        .slice(0, 40),
      serviceSummary: String(args.service_summary ?? "").slice(0, 600),
    };
  },
  summarize(result) {
    const r = result as { businessName?: string };
    return r.businessName ? `basics saved for ${r.businessName}` : "basics saved";
  },
};

const choose_category: AgentTool = {
  name: "choose_category",
  definition: {
    type: "function",
    function: {
      name: "choose_category",
      description: `Choose the best SimplyServed category. One of: ${CATEGORIES.join(", ")}.`,
      parameters: {
        type: "object",
        properties: {
          category: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["category"],
      },
    },
  },
  async run(args) {
    const raw = String(args.category ?? "");
    const category = CATEGORIES.includes(raw) ? raw : "Home services";
    return {
      category,
      rationale: String(args.rationale ?? "").slice(0, 220),
      availableCategories: CATEGORIES,
    };
  },
  summarize(result) {
    const r = result as { category?: string };
    return r.category ? `category: ${r.category}` : "category chosen";
  },
};

const set_location: AgentTool = {
  name: "set_location",
  definition: {
    type: "function",
    function: {
      name: "set_location",
      description: "Capture where the provider serves, for listing geo setup.",
      parameters: {
        type: "object",
        properties: {
          neighborhood: { type: "string" },
          city: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
        },
        required: ["city"],
      },
    },
  },
  async run(args, ctx) {
    const lat = typeof args.lat === "number" ? args.lat : ctx.lat;
    const lng = typeof args.lng === "number" ? args.lng : ctx.lng;
    return {
      neighborhood: String(args.neighborhood ?? "").slice(0, 120),
      city: String(args.city ?? "").slice(0, 120),
      lat,
      lng,
    };
  },
  summarize(result) {
    const r = result as { city?: string; neighborhood?: string };
    const place = [r.neighborhood, r.city].filter(Boolean).join(", ");
    return place || "location captured";
  },
};

const verify_claim_handoff: AgentTool = {
  name: "verify_claim_handoff",
  definition: {
    type: "function",
    function: {
      name: "verify_claim_handoff",
      description:
        "Prepare verification/claim next steps by checking potential claimable business profiles for the signed-in provider.",
      parameters: {
        type: "object",
        properties: {
          website_domain: { type: "string" },
        },
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.userId) return { error: "Sign in required." };
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });
    if (!user) return { error: "User not found." };

    const providedDomain = String(args.website_domain ?? "").trim().toLowerCase();
    const emailDomain = user.email.split("@")[1]?.toLowerCase() ?? "";
    const domain = providedDomain || emailDomain;

    const byDomain = domain
      ? await prisma.businessProfile.findMany({
          where: {
            claimStatus: "UNCLAIMED",
            website: { contains: domain },
          },
          select: { id: true, slug: true, name: true },
          take: 5,
          orderBy: { createdAt: "desc" },
        })
      : [];

    return {
      emailDomain,
      claimableProfiles: byDomain,
      claimStartUrlTemplate: "/businesses/{slug}/claim",
      verifyMethods: ["EMAIL_DOMAIN", "PHONE_OTP", "DOC_UPLOAD"],
      handoff: byDomain.length
        ? "Use the claim URL for the closest match and complete verification."
        : "No direct profile match yet. Continue by creating your first listing.",
    };
  },
  summarize(result) {
    const r = result as { error?: string; claimableProfiles?: unknown[] };
    return r.error ?? `${r.claimableProfiles?.length ?? 0} claim matches`;
  },
};

const draft_first_listing: AgentTool = {
  name: "draft_first_listing",
  definition: {
    type: "function",
    function: {
      name: "draft_first_listing",
      description:
        "Produce a first listing draft and hand-off links for provider onboarding.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          category: { type: "string" },
          hourly_rate: { type: "number" },
        },
        required: ["title", "description", "category", "hourly_rate"],
      },
    },
  },
  async run(args) {
    const category = CATEGORIES.includes(String(args.category ?? ""))
      ? String(args.category)
      : "Home services";
    return {
      title: String(args.title ?? "").slice(0, 120),
      description: String(args.description ?? "").slice(0, 1500),
      category,
      hourlyRate: Math.max(1, Math.min(10_000, Number(args.hourly_rate ?? 50))),
      nextStep: "Open /dashboard/provider/listings/new and paste this draft.",
      listingCreateUrl: "/dashboard/provider/listings/new",
    };
  },
  summarize(result) {
    const r = result as { title?: string };
    return r.title ? `drafted: ${r.title}` : "draft ready";
  },
};

export const onboardingAgent: Agent = {
  id: "onboarding",
  label: "Onboarding Agent",
  temperature: 0.5,
  maxSteps: 5,
  tools: [
    collect_business_basics,
    choose_category,
    set_location,
    verify_claim_handoff,
    draft_first_listing,
  ],
  system: `You are SimplyServed's real-time onboarding guide for new providers.

Goals in order:
1) collect business basics,
2) map to a category,
3) confirm service location,
4) route to verification / claim hand-off when applicable,
5) produce a first listing draft.

Rules:
- Keep responses concise and sequential: ask one focused question at a time.
- Prefer calling tools to structure progress before replying.
- Never claim you've created listings or completed verification; only provide hand-off steps.
- If a tool returns an error, explain the fallback path clearly.
- End each reply with the single best next action for the provider.`,
};
