/**
 * Scrape scheduler tick.
 *
 * Picks up due jobs (QUEUED or RATE_LIMITED after cooldown) and runs them
 * one at a time. When the queue is empty the tick auto-seeds jobs for every
 * enabled scraper × every target slug in `data/osm-targets.json`.
 *
 * Zero-argument usage (both aliases do the same thing):
 *
 *   npm run scrape:tick
 *   npm run scrape:once
 *
 * Backward-compatible explicit target (still works, no longer required):
 *
 *   npm run scrape:once -- --source osm --target sf-mission
 *
 * Environment overrides:
 *   SCRAPE_BATCH             – max jobs per tick             (default 5)
 *   SCRAPE_JOB_DELAY_MS      – delay between jobs in ms      (default 2000)
 *   SCRAPE_REFRESH_INTERVAL_MS – min age before re-seeding   (default 3600000 = 1 h)
 */
import { prisma } from "@/lib/prisma";
import { runScrapeJob } from "@/lib/scrapers/runner";
import { ScrapeJobStatus, ScrapeSource } from "@prisma/client";
import { enabledScrapers, getScraperById } from "@/lib/scrapers/registry";
import osmTargets from "@/data/osm-targets.json";

// Max jobs to run per tick — prevents a single tick from exhausting resources.
const BATCH = parseInt(process.env.SCRAPE_BATCH ?? "", 10) || 5;

// Politeness delay between consecutive jobs (ms).
const JOB_DELAY_MS = parseInt(process.env.SCRAPE_JOB_DELAY_MS ?? "", 10) || 2000;

// Minimum time since last OK/FAILED job before the same (source, target) can
// be re-seeded. Prevents a 1-minute cron from hammering the same targets.
const REFRESH_INTERVAL_MS =
  parseInt(process.env.SCRAPE_REFRESH_INTERVAL_MS ?? "", 10) || 60 * 60 * 1000; // 1 hour

interface CliArgs {
  source?: string;
  target?: string;
  once?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") out.source = argv[++i];
    else if (a === "--target" || a === "--city") out.target = argv[++i];
    else if (a === "--once") out.once = true;
  }
  return out;
}

async function pickDueJobs(limit: number) {
  const now = new Date();
  return prisma.scrapeJob.findMany({
    where: {
      OR: [
        { status: ScrapeJobStatus.QUEUED },
        {
          status: ScrapeJobStatus.RATE_LIMITED,
          finishedAt: { lt: new Date(now.getTime() - 30 * 60 * 1000) },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * Seed jobs for every enabled scraper × every OSM target slug, skipping:
 *   - pairs with an active QUEUED/RUNNING job, and
 *   - pairs whose last completed (OK/FAILED) job finished within the refresh
 *     interval (avoids hammering sources from a tight cron loop).
 *
 * Returns the ids of newly-created ScrapeJob rows.
 */
async function seedJobs(): Promise<string[]> {
  const scrapers = enabledScrapers();
  const targets = (osmTargets as { slug: string }[]).map((t) => t.slug);
  const cutoff = new Date(Date.now() - REFRESH_INTERVAL_MS);
  const created: string[] = [];

  for (const scraper of scrapers) {
    for (const target of targets) {
      // Skip if there is already a live job for this (source, target).
      const active = await prisma.scrapeJob.findFirst({
        where: {
          source: scraper.source as ScrapeSource,
          target,
          status: { in: [ScrapeJobStatus.QUEUED, ScrapeJobStatus.RUNNING] },
        },
        select: { id: true },
      });
      if (active) continue;

      // Skip if the target was already scraped recently.
      const recent = await prisma.scrapeJob.findFirst({
        where: {
          source: scraper.source as ScrapeSource,
          target,
          status: { in: [ScrapeJobStatus.OK, ScrapeJobStatus.FAILED] },
          finishedAt: { gte: cutoff },
        },
        select: { id: true },
      });
      if (recent) continue;

      const job = await prisma.scrapeJob.create({
        data: {
          source: scraper.source as ScrapeSource,
          target,
          status: ScrapeJobStatus.QUEUED,
        },
        select: { id: true },
      });
      created.push(job.id);
    }
  }

  return created;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // -- Explicit --source/--target mode (backward compat) --------------------
  if (args.source && args.target) {
    const scraper = getScraperById(args.source);
    if (!scraper) {
      console.warn(`[scrape] Unknown scraper: "${args.source}" — skipping`);
      console.warn(`[scrape] Known scrapers: ${enabledScrapers().map((s) => s.id).join(", ")}`);
      return;
    }
    if (!scraper.enabled()) {
      console.warn(`[scrape] Scraper "${scraper.id}" is not enabled (missing API key or env flag) — skipping`);
      return;
    }
    const job = await prisma.scrapeJob.create({
      data: {
        source: scraper.source as ScrapeSource,
        target: args.target,
        status: ScrapeJobStatus.QUEUED,
      },
    });
    console.log(`▶ Running ${scraper.id} on ${args.target} (job ${job.id})…`);
    try {
      const result = await runScrapeJob(job.id);
      console.log(`✓ ${result.status}: seen=${result.itemsSeen} upserted=${result.itemsUpserted} rejected=${result.itemsRejected}`);
      if (result.error) console.log(`  error: ${result.error}`);
    } catch (err) {
      console.warn(`[scrape] Job ${job.id} threw unexpectedly:`, err);
    }
    return;
  }

  // -- Queue-driven / auto-seed mode ----------------------------------------
  let jobs = await pickDueJobs(BATCH);

  if (jobs.length === 0) {
    console.log("[scrape] Queue empty — auto-seeding…");
    const seeded = await seedJobs();
    if (seeded.length === 0) {
      console.log("[scrape] Nothing to seed (all targets are recent or already queued)");
      return;
    }
    console.log(`[scrape] Seeded ${seeded.length} job(s)`);
    jobs = await pickDueJobs(BATCH);
  }

  let rateLimited = false;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];

    if (rateLimited) {
      console.warn(`[scrape] Rate-limited — skipping remaining ${jobs.length - i} job(s) this tick`);
      break;
    }

    console.log(`▶ Running job ${job.id} (${job.source} / ${job.target})…`);
    try {
      const result = await runScrapeJob(job.id);
      console.log(`  ${result.status}: seen=${result.itemsSeen} upserted=${result.itemsUpserted} rejected=${result.itemsRejected}`);
      if (result.error) console.log(`  error: ${result.error}`);
      if (result.status === ScrapeJobStatus.RATE_LIMITED) {
        rateLimited = true;
      }
    } catch (err) {
      console.warn(`[scrape] Job ${job.id} threw unexpectedly:`, err);
    }

    // Polite delay between jobs (skip after the last one).
    if (!rateLimited && i < jobs.length - 1) {
      await sleep(JOB_DELAY_MS);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
