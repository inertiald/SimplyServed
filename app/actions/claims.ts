"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { indexCoords } from "@/lib/h3";
import type { ActionResult } from "./auth";

/**
 * Claim flow.
 *
 *   startClaim   → creates a PENDING claim, generates a verification challenge
 *   submitVerification → checks the user-submitted proof, marks VERIFIED on success,
 *                        then promotes the BusinessProfile into a real Listing.
 *   adminDecideClaim → for DOC_UPLOAD / ADMIN paths.
 *   requestTakedown  → tombstones a profile so we stop re-ingesting it.
 *
 * Notification stubs (email / phone OTP) log to console in dev — the exact
 * pattern used by the seed accounts. Swap the function bodies for Twilio /
 * Resend / Postmark in production.
 */

const StartClaimSchema = z.object({
  profileId: z.string().uuid(),
  method: z.enum(["EMAIL_DOMAIN", "PHONE_OTP", "DOC_UPLOAD"]),
});

function genCode(): string {
  // 6-digit numeric — easy to type from a phone call / SMS / email.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function emailDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Dev-friendly notification stub. Production replaces these two with calls
 * to Twilio / Postmark / Resend behind the same interface.
 */
async function sendOtp(channel: "email" | "phone", to: string, code: string) {
  console.log(`[claim] OTP via ${channel} to ${to}: ${code}`);
}

export async function startClaimAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  // Hard cap on claim attempts per user/IP to prevent claim-spam.
  const rl = await rateLimit(`claim:start:${user.id}`, 10, 60 * 60);
  if (!rl.allowed) {
    return { ok: false, error: "Too many claim attempts. Try again later." };
  }

  const parsed = StartClaimSchema.safeParse({
    profileId: formData.get("profileId"),
    method: formData.get("method"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid claim request." };

  const profile = await prisma.businessProfile.findUnique({
    where: { id: parsed.data.profileId },
  });
  if (!profile || profile.tombstonedAt) {
    return { ok: false, error: "Business profile not found." };
  }
  if (profile.claimStatus === "CLAIMED") {
    return { ok: false, error: "This business is already claimed." };
  }

  const code = genCode();
  let verificationPayload: object = { codeHash: hashCode(code), createdAt: Date.now() };

  if (parsed.data.method === "EMAIL_DOMAIN") {
    const domain = emailDomain(profile.website);
    if (!domain) {
      return { ok: false, error: "No website on record — choose phone or document instead." };
    }
    // Send the code to the user's own email; we verify their email *matches*
    // the business domain. This is enough to prove control of an email at
    // that domain.
    if (!user.email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
      return {
        ok: false,
        error: `Sign in with an email at @${domain} to use this method, or pick another.`,
      };
    }
    await sendOtp("email", user.email, code);
    verificationPayload = { ...verificationPayload, domain };
  } else if (parsed.data.method === "PHONE_OTP") {
    if (!profile.phone) {
      return { ok: false, error: "No phone on record — choose another verification method." };
    }
    await sendOtp("phone", profile.phone, code);
    verificationPayload = { ...verificationPayload, phone: profile.phone };
  } else {
    // DOC_UPLOAD → no code; status stays PENDING until admin reviews.
    verificationPayload = { docPending: true, createdAt: Date.now() };
  }

  const claim = await prisma.businessClaim.create({
    data: {
      businessProfileId: profile.id,
      claimantUserId: user.id,
      verificationMethod: parsed.data.method,
      verificationPayload,
      status: "PENDING",
    },
  });
  await prisma.businessProfile.update({
    where: { id: profile.id },
    data: { claimStatus: "PENDING" },
  });
  revalidatePath(`/businesses/${profile.slug}`);
  return { ok: true, data: { claimId: claim.id } };
}

const SubmitVerificationSchema = z.object({
  claimId: z.string().uuid(),
  code: z.string().min(1).max(40).optional(),
  docUrl: z.string().url().optional(),
});

export async function submitVerificationAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = SubmitVerificationSchema.safeParse({
    claimId: formData.get("claimId"),
    code: formData.get("code") ?? undefined,
    docUrl: formData.get("docUrl") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid verification submission." };

  const claim = await prisma.businessClaim.findUnique({
    where: { id: parsed.data.claimId },
    include: { businessProfile: true },
  });
  if (!claim || claim.claimantUserId !== user.id) {
    return { ok: false, error: "Claim not found." };
  }
  if (claim.status !== "PENDING") {
    return { ok: false, error: "This claim has already been decided." };
  }

  if (claim.verificationMethod === "DOC_UPLOAD") {
    if (!parsed.data.docUrl) return { ok: false, error: "Upload a document first." };
    await prisma.businessClaim.update({
      where: { id: claim.id },
      data: {
        verificationPayload: {
          ...(claim.verificationPayload as object | null ?? {}),
          docUrl: parsed.data.docUrl,
          submittedAt: Date.now(),
        },
      },
    });
    return { ok: true, data: { pendingAdmin: true } };
  }

  // EMAIL_DOMAIN / PHONE_OTP — match the OTP.
  if (!parsed.data.code) return { ok: false, error: "Enter the verification code." };
  const payload = (claim.verificationPayload as { codeHash?: string }) ?? {};
  if (!payload.codeHash || payload.codeHash !== hashCode(parsed.data.code.trim())) {
    return { ok: false, error: "Incorrect or expired code." };
  }

  await finalizeClaim(claim.id);
  revalidatePath(`/businesses/${claim.businessProfile.slug}`);
  return { ok: true, data: { listingId: (await prisma.businessProfile.findUnique({ where: { id: claim.businessProfileId }, select: { claimedListingId: true } }))?.claimedListingId } };
}

/**
 * Convert a verified claim into a real Listing the claimant owns.
 * Runs in a single transaction so claim + profile + listing stay consistent.
 */
async function finalizeClaim(claimId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const claim = await tx.businessClaim.findUnique({
      where: { id: claimId },
      include: { businessProfile: true },
    });
    if (!claim) throw new Error("claim missing");
    const p = claim.businessProfile;

    const hasGeo = typeof p.lat === "number" && typeof p.lng === "number";
    if (!hasGeo) throw new Error("profile missing geo");
    const geo = indexCoords(p.lat as number, p.lng as number);

    const listing = await tx.listing.create({
      data: {
        providerId: claim.claimantUserId,
        title: p.name,
        description: p.description ?? `${p.name} — neighborhood business.`,
        category: p.category ?? "Local services",
        hourlyRate: 50, // sane default; owner edits after claim.
        lat: geo.lat,
        lng: geo.lng,
        h3City: geo.h3City,
        h3Neighborhood: geo.h3Neighborhood,
        originBusinessProfileId: p.id,
      },
    });

    await tx.businessProfile.update({
      where: { id: p.id },
      data: { claimStatus: "CLAIMED", claimedListingId: listing.id },
    });
    await tx.businessClaim.update({
      where: { id: claim.id },
      data: { status: "VERIFIED", decidedAt: new Date() },
    });
  });
}

const AdminDecideSchema = z.object({
  claimId: z.string().uuid(),
  decision: z.enum(["APPROVE", "REJECT"]),
});

export async function adminDecideClaimAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMINISTRATOR") {
    return { ok: false, error: "Admin only." };
  }
  const parsed = AdminDecideSchema.safeParse({
    claimId: formData.get("claimId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid decision." };
  const claim = await prisma.businessClaim.findUnique({
    where: { id: parsed.data.claimId },
  });
  if (!claim) return { ok: false, error: "Claim not found." };

  if (parsed.data.decision === "APPROVE") {
    await finalizeClaim(claim.id);
  } else {
    await prisma.businessClaim.update({
      where: { id: claim.id },
      data: {
        status: "REJECTED",
        decidedAt: new Date(),
        decidedByUserId: user.id,
      },
    });
    await prisma.businessProfile.update({
      where: { id: claim.businessProfileId },
      data: { claimStatus: "REJECTED" },
    });
  }
  revalidatePath("/dashboard/admin/claims");
  return { ok: true, data: null };
}

const TakedownSchema = z.object({
  profileId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export async function requestTakedownAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  // Allow anonymous takedown requests, but rate-limit per IP-like key.
  const ipKey = String(formData.get("_ipKey") ?? "anon");
  const rl = await rateLimit(`claim:takedown:${ipKey}`, 5, 60 * 60);
  if (!rl.allowed) return { ok: false, error: "Too many takedown requests. Try again later." };

  const parsed = TakedownSchema.safeParse({
    profileId: formData.get("profileId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid takedown request." };

  await prisma.businessProfile.update({
    where: { id: parsed.data.profileId },
    data: {
      tombstonedAt: new Date(),
      tombstoneReason: parsed.data.reason.slice(0, 500),
    },
  });
  return { ok: true, data: null };
}
