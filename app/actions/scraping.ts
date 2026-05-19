"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { runScrapeJob } from "@/lib/scrapers/runner";
import { ScrapeJobStatus, ScrapeSource } from "@prisma/client";
import { getPublisher } from "@/lib/redis";
import type { ActionResult } from "./auth";

/**
 * Admin-only Server Actions for the scraping subsystem.
 *
 * - `enqueueScrapeJob`  → admin "Run now" button.
 * - `setScraperHalt`    → flip the Redis circuit breaker on/off.
 */

const EnqueueSchema = z.object({
  source: z.nativeEnum(ScrapeSource),
  target: z.string().min(1).max(120),
  runNow: z.coerce.boolean().default(true),
});

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMINISTRATOR") {
    throw new Error("Admin only");
  }
  return user;
}

export async function enqueueScrapeJobAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = EnqueueSchema.safeParse({
    source: formData.get("source"),
    target: formData.get("target"),
    runNow: formData.get("runNow") ?? "true",
  });
  if (!parsed.success) return { ok: false, error: "Invalid job parameters." };

  const job = await prisma.scrapeJob.create({
    data: {
      source: parsed.data.source,
      target: parsed.data.target,
      status: ScrapeJobStatus.QUEUED,
    },
  });
  if (parsed.data.runNow) {
    // Fire-and-forget — the Next.js server keeps running it after the
    // Server Action returns. For larger jobs use the scheduler tick instead.
    runScrapeJob(job.id).catch((err) => {
      console.error("[scrape] inline run failed:", err);
    });
  }
  revalidatePath("/dashboard/admin/scraping");
  return { ok: true, data: { jobId: job.id } };
}

const HaltSchema = z.object({ halt: z.coerce.boolean() });

export async function setScraperHaltAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = HaltSchema.safeParse({ halt: formData.get("halt") });
  if (!parsed.success) return { ok: false, error: "Invalid halt value." };
  try {
    const r = getPublisher();
    if (r.status !== "ready") await r.connect().catch(() => undefined);
    if (parsed.data.halt) await r.set("scraper:halt", "1");
    else await r.del("scraper:halt");
  } catch {
    return { ok: false, error: "Redis unavailable — cannot toggle halt." };
  }
  revalidatePath("/dashboard/admin/scraping");
  return { ok: true, data: null };
}
