"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { safePublish } from "@/lib/redis";
import type { ActionResult } from "./auth";

const ReviewSchema = z.object({
  requestId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

/**
 * Create or update a review for a completed service request.
 *
 * Constraints:
 *   - Caller must be the consumer on the request.
 *   - Request must be in COMPLETED status (no rage-reviews mid-flow).
 *   - One review per request — re-submits update in place (idempotent UX).
 *   - Listing's denormalized aggregates are recomputed inside the same
 *     transaction so the discover/listing-card surfaces stay consistent.
 */
export async function leaveReviewAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ReviewSchema.safeParse({
    requestId: formData.get("requestId"),
    rating: formData.get("rating"),
    body: formData.get("body") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Pick a rating from 1 to 5 stars." };
  }
  const { requestId, rating, body } = parsed.data;

  const req = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      consumerId: true,
      status: true,
      listing: { select: { id: true, providerId: true } },
    },
  });
  if (!req) return { ok: false, error: "Request not found." };
  if (req.consumerId !== user.id) {
    return { ok: false, error: "You can only review your own bookings." };
  }
  if (req.status !== "COMPLETED") {
    return { ok: false, error: "You can review after the service is completed." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.review.upsert({
      where: { requestId },
      create: {
        requestId,
        listingId: req.listing.id,
        authorId: user.id,
        providerId: req.listing.providerId,
        rating,
        body,
      },
      update: { rating, body },
    });

    // Recompute denorm aggregates from source of truth.
    const agg = await tx.review.aggregate({
      where: { listingId: req.listing.id },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.listing.update({
      where: { id: req.listing.id },
      data: {
        // Round to one decimal to match what we render — keeps stale-cache
        // diffs minimal under repeated upserts.
        ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        ratingCount: agg._count._all,
      },
    });
  });

  // Tell the provider their reputation just changed.
  await safePublish(`notify:user:${req.listing.providerId}`, {
    kind: "review",
    requestId,
    rating,
    preview: `New ${rating}-star review from ${user.name}`,
    at: new Date().toISOString(),
  });

  revalidatePath(`/listings/${req.listing.id}`);
  revalidatePath(`/u/${req.listing.providerId}`);
  revalidatePath("/dashboard/consumer");
  revalidatePath("/dashboard/provider");

  return { ok: true, data: { rating, body } };
}
