"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { indexCoords } from "@/lib/h3";
import type { ActionResult } from "./auth";

const ListingSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(20).max(4000),
  category: z.string().min(2).max(60),
  hourlyRate: z.coerce.number().min(1).max(10_000),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function createListingAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ListingSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    hourlyRate: formData.get("hourlyRate"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please review the form for errors." };
  }

  const geo = indexCoords(parsed.data.lat, parsed.data.lng);
  const listing = await prisma.listing.create({
    data: {
      providerId: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      hourlyRate: parsed.data.hourlyRate,
      lat: geo.lat,
      lng: geo.lng,
      h3City: geo.h3City,
      h3Neighborhood: geo.h3Neighborhood,
    },
  });

  // Make sure the user has a provider profile blob (without clobbering
  // anything they may have already set).
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { providerProfile: true },
  });
  const existing = (me?.providerProfile ?? {}) as Record<string, unknown>;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      providerProfile: {
        ...existing,
        businessName: existing.businessName ?? user.name,
      } as object,
    },
  });

  revalidatePath("/dashboard/provider");
  revalidatePath("/listings");
  revalidatePath("/vibe");

  return { ok: true, data: { id: listing.id } };
}

export async function setListingStatusAction(
  listingId: string,
  status: "ACTIVE" | "INACTIVE",
): Promise<ActionResult> {
  const user = await requireUser();
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.providerId !== user.id) {
    return { ok: false, error: "Not allowed." };
  }
  await prisma.listing.update({ where: { id: listingId }, data: { status } });
  revalidatePath("/dashboard/provider");
  revalidatePath(`/listings/${listingId}`);
  return { ok: true, data: null };
}
