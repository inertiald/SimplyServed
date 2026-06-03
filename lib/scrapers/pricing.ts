/**
 * Price-comparison assembly.
 *
 * Turns the raw `BusinessPriceQuote` rows attached to a profile (one per
 * channel/item) into the sorted, deep-linked rows the comparison table
 * renders. Also owns the small bit of policy that maps a scrape *source* to
 * its natural sales *channel* (e.g. the DoorDash source implies the DOORDASH
 * channel) so adapters don't have to repeat it.
 *
 * Pure + deterministic so it's unit testable and safe to import from Server
 * Components.
 */
import type { PriceChannel, ScrapeSource } from "@prisma/client";
import { buildChannelLink, channelMeta, type ChannelLink } from "@/lib/deeplinks";

/** Minimal quote shape the assembler needs (a subset of BusinessPriceQuote). */
export interface QuoteInput {
  channel: PriceChannel;
  source: ScrapeSource;
  label: string;
  amount: number;
  currency: string;
  unit?: string | null;
  url?: string | null;
  available?: boolean;
}

export interface PriceComparisonRow {
  channel: PriceChannel;
  channelLabel: string;
  label: string;
  amount: number;
  currency: string;
  unit?: string;
  available: boolean;
  link: ChannelLink;
  /** True for the lowest available price across the set. */
  cheapest: boolean;
  /** % more than the cheapest available row (0 for the cheapest). */
  premiumPct: number;
}

/** Natural channel for a scrape source when a quote doesn't override it. */
export function defaultChannelForSource(source: ScrapeSource): PriceChannel {
  switch (source) {
    case "DOORDASH":
      return "DOORDASH";
    case "UBEREATS":
      return "UBEREATS";
    case "GRUBHUB":
      return "GRUBHUB";
    case "ANGI":
      return "ANGI";
    case "THUMBTACK":
      return "THUMBTACK";
    default:
      // Company website / OG / generic sources are treated as DIRECT.
      return "DIRECT";
  }
}

const ALL_CHANNELS = new Set<PriceChannel>([
  "DIRECT",
  "DOORDASH",
  "UBEREATS",
  "GRUBHUB",
  "ANGI",
  "THUMBTACK",
  "OTHER",
]);

/** Resolve the channel for a candidate quote, falling back to the source. */
export function resolvePriceChannel(
  candidateChannel: string | undefined,
  source: ScrapeSource,
): PriceChannel {
  if (candidateChannel && ALL_CHANNELS.has(candidateChannel as PriceChannel)) {
    return candidateChannel as PriceChannel;
  }
  return defaultChannelForSource(source);
}

/**
 * Build sorted comparison rows. Cheapest available price first, then by
 * channel label for stable output. Unavailable rows sink to the bottom.
 */
export function comparisonRows(quotes: QuoteInput[]): PriceComparisonRow[] {
  const rows: PriceComparisonRow[] = quotes
    .filter((q) => typeof q.amount === "number" && q.amount > 0)
    .map((q) => {
      const available = q.available !== false;
      return {
        channel: q.channel,
        channelLabel: channelMeta(q.channel).label,
        label: q.label,
        amount: q.amount,
        currency: q.currency || "USD",
        unit: q.unit ?? undefined,
        available,
        link: buildChannelLink(q.channel, q.url),
        cheapest: false,
        premiumPct: 0,
      };
    });

  const availableAmounts = rows.filter((r) => r.available).map((r) => r.amount);
  const min = availableAmounts.length ? Math.min(...availableAmounts) : 0;

  for (const r of rows) {
    if (r.available && min > 0) {
      r.cheapest = r.amount === min;
      r.premiumPct = Math.round(((r.amount - min) / min) * 100);
    }
  }

  rows.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (a.amount !== b.amount) return a.amount - b.amount;
    return a.channelLabel.localeCompare(b.channelLabel);
  });

  return rows;
}

/** Format a major-unit amount for display, e.g. (12.5,"USD") → "$12.50". */
export function formatPrice(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
