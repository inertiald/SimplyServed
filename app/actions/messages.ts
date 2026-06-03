"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { safePublish } from "@/lib/redis";
import type { ActionResult } from "./auth";

const SendSchema = z.object({
  requestId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

/**
 * Append a message to a service-request thread. Either the consumer or the
 * listing's provider may post; we publish to the *other* party's notification
 * channel so they get a live ping.
 */
export async function sendMessageAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = SendSchema.safeParse({
    requestId: formData.get("requestId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Message can't be empty (max 2000 chars)." };
  }

  const req = await prisma.serviceRequest.findUnique({
    where: { id: parsed.data.requestId },
    select: { id: true, consumerId: true, listing: { select: { providerId: true } } },
  });
  if (!req) return { ok: false, error: "Request not found." };

  const isConsumer = req.consumerId === user.id;
  const isProvider = req.listing.providerId === user.id;
  if (!isConsumer && !isProvider) {
    return { ok: false, error: "Not your conversation." };
  }

  const msg = await prisma.message.create({
    data: {
      requestId: req.id,
      authorId: user.id,
      body: parsed.data.body,
    },
  });

  // Notify the other party.
  const recipient = isConsumer ? req.listing.providerId : req.consumerId;
  await safePublish(`notify:user:${recipient}`, {
    kind: "message",
    requestId: req.id,
    messageId: msg.id,
    from: user.name,
    preview: parsed.data.body.slice(0, 120),
    at: new Date().toISOString(),
  });

  revalidatePath("/dashboard/consumer");
  revalidatePath("/dashboard/provider");

  return {
    ok: true,
    data: {
      id: msg.id,
      authorId: msg.authorId,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
    },
  };
}

/** Fetch the message thread for a request the caller participates in. */
export async function loadThreadAction(requestId: string): Promise<ActionResult> {
  const user = await requireUser();
  const req = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    select: { consumerId: true, listing: { select: { providerId: true } } },
  });
  if (!req) return { ok: false, error: "Request not found." };
  if (req.consumerId !== user.id && req.listing.providerId !== user.id) {
    return { ok: false, error: "Not your conversation." };
  }
  const messages = await prisma.message.findMany({
    where: { requestId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      body: true,
      authorId: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });
  return {
    ok: true,
    data: messages.map((m) => ({
      id: m.id,
      body: m.body,
      authorId: m.authorId,
      authorName: m.author.name,
      createdAt: m.createdAt.toISOString(),
      isMine: m.authorId === user.id,
    })),
  };
}
