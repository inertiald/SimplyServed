/**
 * robots.txt parser + in-memory cache.
 *
 * Tiny, dependency-free, and only implements the bits we actually need:
 *   - User-agent grouping (`*` and our `SimplyServed-Bot`).
 *   - `Allow:` and `Disallow:` path prefixes (longest match wins, per the
 *     2022 RFC 9309 spec).
 *   - `Crawl-delay:` (seconds) — surfaced to the caller for polite spacing.
 *
 * We deliberately don't ship a heavy library here — `robots-parser` etc.
 * pulls in surprising amounts of code.
 */

interface RobotsRule {
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

interface RobotsDoc {
  fetchedAt: number;
  rules: Map<string, RobotsRule>;
}

const cache = new Map<string, RobotsDoc>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Bot identity used in our User-Agent header AND robots.txt matching. */
export const BOT_UA = "SimplyServed-Bot";

function parseRobots(text: string): Map<string, RobotsRule> {
  const rules = new Map<string, RobotsRule>();
  let current: RobotsRule | null = null;
  let currentAgents: string[] = [];
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!lastWasAgent) {
        currentAgents = [];
        current = { allow: [], disallow: [] };
      }
      currentAgents.push(value.toLowerCase());
      const rule = current!;
      for (const agent of currentAgents) {
        if (!rules.has(agent)) rules.set(agent, rule);
      }
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if (field === "allow") current.allow.push(value);
      else if (field === "disallow") current.disallow.push(value);
      else if (field === "crawl-delay") {
        const n = Number(value);
        if (!Number.isNaN(n)) current.crawlDelay = n;
      }
    }
  }
  return rules;
}

function ruleFor(rules: Map<string, RobotsRule>, ua: string): RobotsRule {
  const lower = ua.toLowerCase();
  return (
    rules.get(lower) ??
    rules.get("simplyserved-bot") ??
    rules.get("*") ?? { allow: [], disallow: [] }
  );
}

function pathMatches(pattern: string, urlPath: string): number {
  // Returns match length or -1. Supports trailing `$` and `*` wildcards.
  if (pattern === "") return -1; // explicit empty disallow means "allow all"
  let p = pattern;
  let anchored = false;
  if (p.endsWith("$")) {
    p = p.slice(0, -1);
    anchored = true;
  }
  const parts = p.split("*");
  let cursor = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0) {
      if (!urlPath.startsWith(part)) return -1;
      cursor = part.length;
    } else {
      const idx = urlPath.indexOf(part, cursor);
      if (idx === -1) return -1;
      cursor = idx + part.length;
    }
  }
  if (anchored && cursor !== urlPath.length) return -1;
  return p.length;
}

export interface RobotsCheck {
  allowed: boolean;
  crawlDelayMs: number;
}

export async function checkRobots(url: string, ua = BOT_UA): Promise<RobotsCheck> {
  const u = new URL(url);
  const origin = `${u.protocol}//${u.host}`;
  let doc = cache.get(origin);
  if (!doc || Date.now() - doc.fetchedAt > CACHE_TTL_MS) {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { "User-Agent": `${BOT_UA}/1.0 (+https://simplyserved.dev/bot)` },
        // Don't let a slow robots.txt block the world.
        signal: AbortSignal.timeout(5000),
      });
      const text = res.ok ? await res.text() : "";
      doc = { fetchedAt: Date.now(), rules: parseRobots(text) };
    } catch {
      // On error treat as no robots.txt (== allow all). That's the spec.
      doc = { fetchedAt: Date.now(), rules: new Map() };
    }
    cache.set(origin, doc);
  }
  const rule = ruleFor(doc.rules, ua);
  const path = u.pathname + u.search;
  const allowLen = Math.max(-1, ...rule.allow.map((p) => pathMatches(p, path)));
  const disallowLen = Math.max(-1, ...rule.disallow.map((p) => pathMatches(p, path)));
  // Longest match wins; tie goes to allow (per spec).
  const allowed = disallowLen === -1 || allowLen >= disallowLen;
  return {
    allowed,
    crawlDelayMs: rule.crawlDelay ? rule.crawlDelay * 1000 : 0,
  };
}

/** Test-only — clears the in-memory cache. */
export function _resetRobotsCache(): void {
  cache.clear();
}
