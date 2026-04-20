"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { indexCoords } from "@/lib/h3";
import { safePublish } from "@/lib/redis";
import { impressionHash } from "@/lib/impressions";
import type { ActionResult } from "./auth";

const PostSchema = z.object({
  postType: z.enum(["GENERAL", "BUSINESS", "OFFER"]).default("GENERAL"),
  contentText: z.string().min(1).max(2000),
  mediaType: z.enum(["IMAGE", "VIDEO", "TEXT_ONLY"]).default("TEXT_ONLY"),
  mediaUrls: z.array(z.string().url().or(z.string().startsWith("/"))).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  listingId: z.string().uuid().optional().nullable(),
  offer: z
    .object({
      code: z.string().min(2).max(40),
      discount: z.string().min(1).max(40),
      expiresAt: z.string().min(1),
    })
    .optional()
    .nullable(),
});

export type CreatePostInput = z.infer<typeof PostSchema>;

export async function createPostAction(input: CreatePostInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = PostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid post." };
  }
  const data = parsed.data;

  // OFFER posts must reference a listing the user owns.
  if (data.postType === "OFFER" || data.postType === "BUSINESS") {
    if (!data.listingId) {
      return { ok: false, error: "Business and offer posts must reference one of your listings." };
    }
    const listing = await prisma.listing.findUnique({ where: { id: data.listingId } });
    if (!listing || listing.providerId !== user.id) {
      return { ok: false, error: "You can only post on behalf of your own listings." };
    }
  }

  if (data.postType === "OFFER" && !data.offer) {
    return { ok: false, error: "Offer posts require offer details." };
  }

  const geo = indexCoords(data.lat, data.lng);

  const post = await prisma.post.create({
    data: {
      userId: user.id,
      listingId: data.listingId ?? null,
      postType: data.postType,
      contentText: data.contentText,
      mediaType: data.mediaType,
      mediaUrls: data.mediaUrls ? (data.mediaUrls as object) : undefined,
      lat: geo.lat,
      lng: geo.lng,
      h3Neighborhood: geo.h3Neighborhood,
      metadata: data.offer ? ({ offer: data.offer } as object) : undefined,
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      listing: { select: { id: true, title: true } },
    },
  });

  await safePublish(`vibe:h3:${geo.h3Neighborhood}`, { type: "post.created", post });

  revalidatePath("/vibe");
  return { ok: true, data: { id: post.id } };
}

export async function reactToListingAction(
  listingId: string,
  reaction: "LIKE" | "LOVE" | "WOW",
): Promise<ActionResult> {
  const user = await requireUser();
  const hash = impressionHash(user.id, listingId, reaction);
  try {
    await prisma.impression.create({
      data: { listingId, reactionType: reaction, impressionHash: hash },
    });
  } catch {
    // Unique violation = already reacted this hour. Treat as success (idempotent).
  }
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/vibe");
  return { ok: true, data: null };
}

export async function deletePostAction(postId: string): Promise<ActionResult> {
  const user = await requireUser();
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return { ok: false, error: "Post not found." };
  if (post.userId !== user.id && user.role !== "ADMINISTRATOR") {
    return { ok: false, error: "Not allowed." };
  }
  await prisma.post.update({ where: { id: postId }, data: { status: "DELETED" } });
  revalidatePath("/vibe");
  return { ok: true, data: null };
}
