/**
 * Registry of all known scrapers. Order matters only insofar as the runner
 * iterates this list when an admin asks for "all sources".
 *
 * Each scraper opts in via `enabled()` (typically an env-var check) so we
 * never accidentally hit a paid API or a hostile-to-scraping site without
 * explicit configuration.
 */
import type { Scraper } from "./types";
import type { ScrapeSource } from "@prisma/client";
import { osmScraper } from "./osm";
import { yelpScraper } from "./yelp";
import { googleScraper } from "./google";
import { chamberScraper } from "./chamber";
import { socialScraper } from "./social";
import { websiteScraper, doordashScraper, angiScraper } from "./marketplace";

export const ALL_SCRAPERS: Scraper[] = [
  osmScraper,
  yelpScraper,
  googleScraper,
  chamberScraper,
  socialScraper,
  websiteScraper,
  doordashScraper,
  angiScraper,
];

export function getScraperBySource(source: ScrapeSource): Scraper | null {
  return ALL_SCRAPERS.find((s) => s.source === source) ?? null;
}

export function getScraperById(id: string): Scraper | null {
  return ALL_SCRAPERS.find((s) => s.id === id) ?? null;
}

export function enabledScrapers(): Scraper[] {
  return ALL_SCRAPERS.filter((s) => {
    try {
      return s.enabled();
    } catch {
      return false;
    }
  });
}
