/**
 * scripts/simulate.ts — dev-only engagement simulator
 *
 * Randomly increments impressions on existing listings and occasionally
 * creates a new general post, so the smart discover feed shows live ranking
 * changes without needing real users.
 *
 * Usage:
 *   npx tsx scripts/simulate.ts
 *
 * Stop with Ctrl-C. Safe to run alongside `npm run dev`.
 */

import { PrismaClient, Reaction } from "@prisma/client";
import crypto from "node:crypto";
import { latLngToCell } from "h3-js";

const prisma = new PrismaClient();

const RES_NEIGHBORHOOD = 9;

// ── Config ────────────────────────────────────────────────────────────────────
const IMPRESSION_INTERVAL_MS = 3_000;   // add impressions every 3 s
const POST_INTERVAL_MS = 30_000;        // maybe add a post every 30 s
const POST_PROBABILITY = 0.3;           // 30% chance per interval

// ── Helpers ───────────────────────────────────────────────────────────────────
const REACTIONS: Reaction[] = [Reaction.LIKE, Reaction.LOVE, Reaction.WOW];

function randomReaction(): Reaction {
  return REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
}

function randomHash(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Pick a random element from a non-empty array. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

const COMMUNITY_POSTS = [
  "Anyone else smell the churros from the cart on Valencia? 🤤",
  "Heads up: resurfacing on 18th St starting Monday, expect detours.",
  "Free sourdough starter — DM me if you want some. Too much discard 😅",
  "Street lights near Guerrero park are out again — anyone reported it?",
  "Looking for a solid neighbourhood plumber rec — any suggestions?",
  "Pop-up night market on 22nd this Saturday 5–9pm! 🎉",
  "Has anyone tried the new Ethiopian spot on Mission? Worth it?",
  "Lost earbuds near Dolores Park — one AirPod Pro. Any good soul?",
  "Community fridge on Capp is restocked. Thank you to everyone who contributed 💚",
  "Beautiful evening walk — the jacarandas on 20th are peak right now 💜",
];

// ── Main simulation loop ───────────────────────────────────────────────────────
async function addImpression() {
  const listings = await prisma.listing.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  }) as Array<{ id: string }>;
  if (listings.length === 0) return;

  const listing = pick(listings);
  const reaction = randomReaction();

  try {
    await prisma.impression.create({
      data: {
        listingId: listing.id,
        impressionHash: randomHash(),
        reactionType: reaction,
      },
    });
    process.stdout.write(`  👍 impression (${reaction}) → ${listing.id.slice(0, 8)}…\r`);
  } catch {
    // Hash collision — skip quietly.
  }
}

async function maybeAddPost() {
  if (Math.random() > POST_PROBABILITY) return;

  const users = await prisma.user.findMany({ select: { id: true } }) as Array<{ id: string }>;
  if (users.length === 0) return;

  const user = pick(users);
  const text = pick(COMMUNITY_POSTS);
  // Small random jitter around the SF Mission District base.
  const lat = 37.7748 + (Math.random() - 0.5) * 0.008;
  const lng = -122.4185 + (Math.random() - 0.5) * 0.008;
  const h3Neighborhood = latLngToCell(lat, lng, RES_NEIGHBORHOOD);

  await prisma.post.create({
    data: {
      userId: user.id,
      postType: "GENERAL",
      contentText: text,
      mediaType: "TEXT_ONLY",
      lat,
      lng,
      h3Neighborhood,
    },
  });
  console.log(`\n  📝 new post: "${text.slice(0, 50)}…"`);
}

async function main() {
  console.log("🔄 SimplyServed engagement simulator running (Ctrl-C to stop)");
  console.log("   Impressions every 3 s · new post ~30% chance per 30 s\n");

  setInterval(addImpression, IMPRESSION_INTERVAL_MS);
  setInterval(maybeAddPost, POST_INTERVAL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
