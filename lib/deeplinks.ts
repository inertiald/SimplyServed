/**
 * Channel deep links.
 *
 * A "price quote" on a `BusinessProfile` points at a public storefront URL on
 * some sales channel (the company's own website, DoorDash, Angi, …). To let a
 * consumer actually *buy* through that method we turn the web URL into a pair:
 *
 *   - `appUrl` — a native app deep link / universal link that opens the
 *     channel's mobile app straight to the store when it's installed.
 *   - `webUrl` — the plain https fallback that always works in a browser.
 *
 * This module is intentionally pure (no Prisma, no fetch) so it can be unit
 * tested and imported from both Server Components and the scraper layer.
 *
 * We never invent identifiers: when the source URL doesn't carry enough info
 * to build a real deep link we simply fall back to the web URL, so a button is
 * always tappable and never dead-ends into a wrong store.
 */
import type { PriceChannel } from "@prisma/client";

export interface ChannelLink {
  /** Native app deep link when derivable, else the web URL. */
  appUrl: string;
  /** Always-valid https URL. */
  webUrl: string;
  /** Short verb for the CTA, e.g. "Order", "Book", "Visit". */
  action: string;
  /** Display name of the channel, e.g. "DoorDash". */
  label: string;
}

interface ChannelMeta {
  label: string;
  action: string;
  /** Hosts that identify a web URL as belonging to this channel. */
  hosts: string[];
  /** Build an app deep link from the parsed web URL, or null to use web. */
  appLink?: (url: URL) => string | null;
}

/** First path segment after a known prefix, e.g. /store/<id> → <id>. */
function segmentAfter(url: URL, prefix: string): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.indexOf(prefix);
  if (i === -1 || i + 1 >= parts.length) return null;
  return parts[i + 1] || null;
}

/** Trailing numeric id from a slug like "joes-plumbing-12345". */
function trailingId(slug: string | null): string | null {
  if (!slug) return null;
  const m = slug.match(/(\d{3,})$/);
  return m ? m[1] : null;
}

const CHANNELS: Record<PriceChannel, ChannelMeta> = {
  DIRECT: {
    label: "Website",
    action: "Visit",
    hosts: [],
  },
  DOORDASH: {
    label: "DoorDash",
    action: "Order",
    hosts: ["doordash.com"],
    appLink: (url) => {
      const id = segmentAfter(url, "store");
      return id ? `doordash://store/${id}` : null;
    },
  },
  UBEREATS: {
    label: "Uber Eats",
    action: "Order",
    hosts: ["ubereats.com"],
    appLink: (url) => {
      const id = segmentAfter(url, "store");
      return id ? `ubereats://store/${id}` : null;
    },
  },
  GRUBHUB: {
    label: "Grubhub",
    action: "Order",
    hosts: ["grubhub.com"],
    appLink: (url) => {
      const id = segmentAfter(url, "restaurant");
      return id ? `grubhub://restaurant/${id}` : null;
    },
  },
  ANGI: {
    label: "Angi",
    action: "Book",
    hosts: ["angi.com", "angieslist.com"],
    // Angi pro pages end in a numeric SP id, e.g. /companylist/us/.../123456.htm
    appLink: (url) => {
      const id = trailingId(url.pathname.replace(/\.html?$/i, ""));
      return id ? `angi://serviceProvider/${id}` : null;
    },
  },
  THUMBTACK: {
    label: "Thumbtack",
    action: "Book",
    hosts: ["thumbtack.com"],
    appLink: (url) => {
      const id = segmentAfter(url, "p") ?? segmentAfter(url, "profile");
      return id ? `thumbtack://profile/${id}` : null;
    },
  },
  OTHER: {
    label: "Other",
    action: "View",
    hosts: [],
  },
};

/** Static channel display metadata (no URL required). */
export function channelMeta(channel: PriceChannel): { label: string; action: string } {
  const m = CHANNELS[channel] ?? CHANNELS.OTHER;
  return { label: m.label, action: m.action };
}

/**
 * Infer the channel from a storefront URL host. Used by adapters/UI when the
 * channel isn't otherwise known. Returns `DIRECT` for unknown hosts (assumed
 * to be the company's own site) and `null` for an unparseable URL.
 */
export function channelFromUrl(rawUrl: string): PriceChannel | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.host.toLowerCase().replace(/^www\./, "");
  for (const key of Object.keys(CHANNELS) as PriceChannel[]) {
    if (CHANNELS[key].hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      return key;
    }
  }
  return "DIRECT";
}

/**
 * Build the `{ appUrl, webUrl, action, label }` link bundle for a quote.
 *
 * `url` may be missing (some sources only give a price); callers should hide
 * the CTA in that case. We still return metadata so the table can label the
 * row.
 */
export function buildChannelLink(
  channel: PriceChannel,
  url: string | null | undefined,
): ChannelLink {
  const meta = CHANNELS[channel] ?? CHANNELS.OTHER;
  const base: ChannelLink = {
    appUrl: url ?? "",
    webUrl: url ?? "",
    action: meta.action,
    label: meta.label,
  };
  if (!url) return base;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return base;
  }
  // Only http(s) storefront URLs are safe to surface as buttons.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ...base, appUrl: "", webUrl: "" };
  }

  const app = meta.appLink?.(parsed) ?? null;
  return { ...base, webUrl: parsed.toString(), appUrl: app ?? parsed.toString() };
}
