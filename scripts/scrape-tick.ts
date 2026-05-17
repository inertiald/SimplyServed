/**
 * Scrape scheduler tick.
 *
 * Picks up due jobs (where `nextScrapeAt <= now` OR status QUEUED) and runs
 * them one at a time. Designed to be invoked from cron — Docker compose runs
 * a `scrape` companion service that loops this every minute.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/scrape-tick.ts
 *
 * Or for a one-shot:
 *   npm run scrape:once -- --source osm --target sf-mission
 */
import { prisma } from "@/lib/prisma";
import { runScrapeJob } from "@/lib/scrapers/runner";
import { ScrapeJobStatus, ScrapeSource } from "@prisma/client";
import { enabledScrapers, getScraperById } from "@/lib/scrapers/registry";

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
        { status: ScrapeJobStatus.RATE_LIMITED, finishedAt: { lt: new Date(now.getTime() - 30 * 60 * 1000) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.source && args.target) {
    const scraper = getScraperById(args.source);
    if (!scraper) {
      console.error(`Unknown scraper: ${args.source}`);
      console.error(`Known: ${enabledScrapers().map((s) => s.id).join(", ")}`);
      process.exit(1);
    }
    if (!scraper.enabled()) {
      console.error(`Scraper ${scraper.id} is not enabled (missing API key or env flag).`);
      process.exit(1);
    }
    const job = await prisma.scrapeJob.create({
      data: {
        source: scraper.source as ScrapeSource,
        target: args.target,
        status: ScrapeJobStatus.QUEUED,
      },
    });
    console.log(`▶ Running ${scraper.id} on ${args.target} (job ${job.id})…`);
    const result = await runScrapeJob(job.id);
    console.log(`✓ ${result.status}: seen=${result.itemsSeen} upserted=${result.itemsUpserted} rejected=${result.itemsRejected}`);
    if (result.error) console.log(`  error: ${result.error}`);
    return;
  }

  const jobs = await pickDueJobs(5);
  if (jobs.length === 0) {
    console.log("(no due jobs)");
    return;
  }
  for (const job of jobs) {
    console.log(`▶ Running job ${job.id} (${job.source} / ${job.target})…`);
    const result = await runScrapeJob(job.id);
    console.log(`  ${result.status}: seen=${result.itemsSeen} upserted=${result.itemsUpserted} rejected=${result.itemsRejected}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
