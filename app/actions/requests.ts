"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { calculateFees } from "@/lib/payments";
import { safePublish } from "@/lib/redis";
import type { RequestStatus } from "@prisma/client";
import type { ActionResult } from "./auth";

const CreateRequestSchema = z.object({
  listingId: z.string().uuid(),
  scheduledDate: z.string().optional().nullable(),
  hours: z.coerce.number().min(1).max(24).default(1),
  notes: z.string().max(2000).optional().nullable(),
});

/** Allowed forward transitions in the workflow state machine. */
const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PLACED: ["RESPONDED", "CANCELED", "DROPPED"],
  RESPONDED: ["SCHEDULED", "CANCELED", "DROPPED"],
  SCHEDULED: ["CONFIRMED", "CANCELED", "DROPPED"],
  CONFIRMED: ["COMMENCED", "CANCELED", "DROPPED"],
  COMMENCED: ["STARTED", "DROPPED"],
  STARTED: ["DELIVERED", "DROPPED"],
  DELIVERED: ["COMPLETED", "DROPPED"],
  COMPLETED: [],
  DROPPED: [],
  CANCELED: [],
};

export async function createServiceRequestAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = CreateRequestSchema.safeParse({
    listingId: formData.get("listingId"),
    scheduledDate: formData.get("scheduledDate"),
    hours: formData.get("hours") ?? 1,
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please review the form for errors." };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: parsed.data.listingId },
    select: { id: true, providerId: true, hourlyRate: true, status: true },
  });
  if (!listing || listing.status !== "ACTIVE") {
    return { ok: false, error: "Listing is not available." };
  }
  if (listing.providerId === user.id) {
    return { ok: false, error: "You can't book your own listing." };
  }

  const fees = calculateFees(listing.hourlyRate, parsed.data.hours);
  const request = await prisma.serviceRequest.create({
    data: {
      consumerId: user.id,
      listingId: listing.id,
      status: "PLACED",
      scheduledDate: parsed.data.scheduledDate ? new Date(parsed.data.scheduledDate) : null,
      feeDetails: { ...fees, hours: parsed.data.hours } as object,
      metadata: parsed.data.notes ? { notes: parsed.data.notes } : undefined,
    },
  });

  await safePublish(`notify:provider:${listing.providerId}`, {
    type: "request.placed",
    requestId: request.id,
    listingId: listing.id,
  });

  revalidatePath("/dashboard/consumer");
  revalidatePath("/dashboard/provider");
  revalidatePath(`/listings/${listing.id}`);
  return { ok: true, data: { id: request.id } };
}

export async function transitionRequestStatusAction(
  requestId: string,
  newStatus: RequestStatus,
): Promise<ActionResult> {
  const user = await requireUser();
  const req = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { listing: { select: { providerId: true } } },
  });
  if (!req) return { ok: false, error: "Request not found." };

  const isProvider = req.listing.providerId === user.id;
  const isConsumer = req.consumerId === user.id;
  if (!isProvider && !isConsumer) return { ok: false, error: "Not allowed." };

  const allowed = TRANSITIONS[req.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return { ok: false, error: `Cannot move ${req.status} → ${newStatus}.` };
  }

  // Authorization rules: only the provider can advance through the work
  // pipeline (RESPONDED → DELIVERED). Consumer can confirm and complete.
  const consumerOnly: RequestStatus[] = ["CONFIRMED", "COMPLETED"];
  const providerOnly: RequestStatus[] = ["RESPONDED", "SCHEDULED", "COMMENCED", "STARTED", "DELIVERED"];
  if (consumerOnly.includes(newStatus) && !isConsumer) {
    return { ok: false, error: "Only the consumer can perform this action." };
  }
  if (providerOnly.includes(newStatus) && !isProvider) {
    return { ok: false, error: "Only the provider can perform this action." };
  }

  await prisma.serviceRequest.update({
    where: { id: requestId },
    data: { status: newStatus },
  });

  await safePublish(`notify:user:${req.consumerId}`, {
    type: "request.updated",
    requestId,
    status: newStatus,
  });
  await safePublish(`notify:provider:${req.listing.providerId}`, {
    type: "request.updated",
    requestId,
    status: newStatus,
  });

  revalidatePath("/dashboard/consumer");
  revalidatePath("/dashboard/provider");
  return { ok: true, data: null };
}
