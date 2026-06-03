import { PrismaClient, PostType, MediaType, Reaction } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { latLngToCell } from "h3-js";

const prisma = new PrismaClient();

const RES_CITY = 7;
const RES_NEIGHBORHOOD = 9;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic fake impression hash — safe for seeding, won't collide. */
function fakeImpressionHash(listingId: string, tag: string): string {
  return crypto.createHash("sha256").update(`seed|${listingId}|${tag}`).digest("hex");
}

/** Random integer in [min, max]. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Date some days/hours ago. */
function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Static seed data
// ---------------------------------------------------------------------------

interface SeedListing {
  title: string;
  description: string;
  category: string;
  hourlyRate: number;
  lat: number;
  lng: number;
}

interface SeedUser {
  email: string;
  name: string;
  password: string;
  isProvider: boolean;
  isConsumer: boolean;
  listings?: SeedListing[];
}

// Base coords: SF Mission District (~37.7748, -122.4185).
// Small offsets spread items across several H3 res-9 cells (~175 m each).
const BASE_LAT = 37.7748;
const BASE_LNG = -122.4185;

const USERS: SeedUser[] = [
  {
    email: "ana@simplyserved.dev",
    name: "Ana Rios",
    password: "password123",
    isProvider: true,
    isConsumer: true,
    listings: [
      {
        title: "Cold-brew espresso bar pop-up",
        description:
          "Hand-pulled cold brews and seasonal espresso drinks. I roll my cart out to your block, set up in 15 minutes, and serve up to 30 cups per hour.",
        category: "Food & catering",
        hourlyRate: 75,
        lat: BASE_LAT,
        lng: BASE_LNG,
      },
      {
        title: "Private brunch catering (up to 20 guests)",
        description:
          "Farm-to-table brunch spreads: avocado toasts, pastries, seasonal fruit, fresh-squeezed OJ. Fully set-up and cleaned up.",
        category: "Food & catering",
        hourlyRate: 90,
        lat: BASE_LAT + 0.002,
        lng: BASE_LNG + 0.001,
      },
    ],
  },
  {
    email: "diego@simplyserved.dev",
    name: "Diego Park",
    password: "password123",
    isProvider: true,
    isConsumer: true,
    listings: [
      {
        title: "Same-day bike repair, on your stoop",
        description:
          "Tune-ups, flats, brake bleeds. I bring a full mobile workshop and finish most jobs in under 30 minutes — right outside your door.",
        category: "Repair & handywork",
        hourlyRate: 60,
        lat: BASE_LAT + 0.001,
        lng: BASE_LNG - 0.002,
      },
      {
        title: "Furniture assembly & flat-pack rescue",
        description:
          "IKEA, Amazon, Wayfair — all brands. I bring my own tools. Most pieces done in under an hour.",
        category: "Repair & handywork",
        hourlyRate: 55,
        lat: BASE_LAT - 0.001,
        lng: BASE_LNG - 0.001,
      },
    ],
  },
  {
    email: "studiorho@simplyserved.dev",
    name: "Studio Rho",
    password: "password123",
    isProvider: true,
    isConsumer: false,
    listings: [
      {
        title: "Vinyl drop-in dance class",
        description:
          "60-minute drop-in classes spinning soul, funk, and disco vinyl. Beginner-friendly, all bodies welcome. We have water + mats.",
        category: "Fitness",
        hourlyRate: 40,
        lat: BASE_LAT + 0.003,
        lng: BASE_LNG + 0.002,
      },
      {
        title: "Personal training — outdoor bootcamp",
        description:
          "1-on-1 and small group sessions in Dolores Park. Cardio, strength, flexibility. All fitness levels.",
        category: "Fitness",
        hourlyRate: 65,
        lat: BASE_LAT + 0.004,
        lng: BASE_LNG - 0.003,
      },
      {
        title: "Yoga + meditation — rooftop sessions",
        description:
          "Sunrise and sunset rooftop yoga. Props provided. 8-person maximum for an intimate experience.",
        category: "Fitness",
        hourlyRate: 30,
        lat: BASE_LAT - 0.002,
        lng: BASE_LNG + 0.003,
      },
    ],
  },
  {
    email: "maya@simplyserved.dev",
    name: "Maya Chen",
    password: "password123",
    isProvider: true,
    isConsumer: true,
    listings: [
      {
        title: "Weekend dog walks & overnight care",
        description:
          "Reliable solo & group walks, plus overnight stays. Insured & cert in pet first aid. Daily updates with photos.",
        category: "Pet care",
        hourlyRate: 35,
        lat: BASE_LAT - 0.003,
        lng: BASE_LNG - 0.002,
      },
      {
        title: "Cat sitting & home check-ins",
        description:
          "Daily visits, feeding, litter, play time, and a photo update. Perfect for weekend trips.",
        category: "Pet care",
        hourlyRate: 25,
        lat: BASE_LAT - 0.004,
        lng: BASE_LNG + 0.001,
      },
    ],
  },
  {
    email: "lena@simplyserved.dev",
    name: "Lena Vasiliev",
    password: "password123",
    isProvider: true,
    isConsumer: true,
    listings: [
      {
        title: "Deep-clean apartment service",
        description:
          "Full deep clean: kitchen, bathrooms, floors, windows. Eco-friendly products, 3-hour slots.",
        category: "Cleaning",
        hourlyRate: 45,
        lat: BASE_LAT + 0.005,
        lng: BASE_LNG + 0.004,
      },
      {
        title: "Move-out cleaning (guaranteed deposit back)",
        description:
          "Landlord-grade clean. I photograph before + after. Most clients keep their full deposit.",
        category: "Cleaning",
        hourlyRate: 50,
        lat: BASE_LAT + 0.006,
        lng: BASE_LNG - 0.004,
      },
    ],
  },
  {
    email: "priya@simplyserved.dev",
    name: "Priya Nair",
    password: "password123",
    isProvider: true,
    isConsumer: true,
    listings: [
      {
        title: "Portrait photography — golden hour sessions",
        description:
          "1-hour outdoor portrait sessions around the Mission. 30+ edited photos delivered in 48 h.",
        category: "Photography",
        hourlyRate: 150,
        lat: BASE_LAT + 0.002,
        lng: BASE_LNG - 0.005,
      },
      {
        title: "Event & party photography",
        description:
          "Birthdays, popup dinners, launch parties. Candid and staged shots. Same-day previews.",
        category: "Photography",
        hourlyRate: 180,
        lat: BASE_LAT - 0.001,
        lng: BASE_LNG + 0.004,
      },
    ],
  },
  {
    email: "tom@simplyserved.dev",
    name: "Tom Osei",
    password: "password123",
    isProvider: true,
    isConsumer: true,
    listings: [
      {
        title: "Music lessons — guitar & ukulele",
        description:
          "Beginner to intermediate. Learn songs you actually like. 30 or 60-minute slots, in-person or on your balcony.",
        category: "Lessons",
        hourlyRate: 55,
        lat: BASE_LAT - 0.005,
        lng: BASE_LNG - 0.003,
      },
      {
        title: "DJ set for small events (2–4 h)",
        description:
          "Funk, soul, house, afrobeats. I bring my own setup. Ideal for house parties, pop-ups, and rooftop gatherings.",
        category: "Entertainment",
        hourlyRate: 120,
        lat: BASE_LAT + 0.007,
        lng: BASE_LNG + 0.002,
      },
    ],
  },
  {
    email: "carlos@simplyserved.dev",
    name: "Carlos Mehta",
    password: "password123",
    isProvider: false,
    isConsumer: true,
  },
  {
    email: "jess@simplyserved.dev",
    name: "Jess Liu",
    password: "password123",
    isProvider: false,
    isConsumer: true,
  },
  {
    email: "marco@simplyserved.dev",
    name: "Marco Reyes",
    password: "password123",
    isProvider: false,
    isConsumer: true,
  },
];

// ---------------------------------------------------------------------------
// Extra standalone posts (no listing link) for a rich neighbourhood feed
// ---------------------------------------------------------------------------
const STANDALONE_POSTS = [
  {
    email: "carlos@simplyserved.dev",
    hoursAgoCreated: 1,
    postType: PostType.GENERAL,
    contentText:
      "Saturday morning park cleanup at Mission Dolores — bring gloves, we'll bring bags + coffee ☕",
  },
  {
    email: "jess@simplyserved.dev",
    hoursAgoCreated: 3,
    postType: PostType.GENERAL,
    contentText:
      "Anyone else notice the new mural going up on 18th? 🎨 It's looking incredible — anyone know the artist?",
  },
  {
    email: "marco@simplyserved.dev",
    hoursAgoCreated: 8,
    postType: PostType.GENERAL,
    contentText:
      "Lost tabby cat, orange + white, answers to Mochi. Last seen near Guerrero St. DM if you spot him 🐱",
  },
  {
    email: "carlos@simplyserved.dev",
    hoursAgoCreated: 26,
    postType: PostType.GENERAL,
    contentText:
      "Free bookshelf on the curb — 3-shelf IKEA KALLAX, great condition. First come first served. Corner of 20th & Valencia.",
  },
  {
    email: "jess@simplyserved.dev",
    hoursAgoCreated: 52,
    postType: PostType.GENERAL,
    contentText:
      "PSA: the 14 Mission bus detour is permanent now. New stop is half a block east at Duboce.",
  },
  {
    email: "marco@simplyserved.dev",
    hoursAgoCreated: 72,
    postType: PostType.GENERAL,
    contentText:
      "Community fridge on Capp St is running low — drop off canned goods if you can. They especially need protein.",
  },
  {
    email: "carlos@simplyserved.dev",
    hoursAgoCreated: 96,
    postType: PostType.GENERAL,
    contentText:
      "The taqueria on 24th is back open after renovation — went last night, still incredible. Same family, same tortillas.",
  },
  {
    email: "jess@simplyserved.dev",
    hoursAgoCreated: 120,
    postType: PostType.GENERAL,
    contentText:
      "Anyone have a good rec for a local electrician? Need an outlet added, nothing major.",
  },
  {
    email: "marco@simplyserved.dev",
    hoursAgoCreated: 168,
    postType: PostType.GENERAL,
    contentText:
      "Reminder: neighbourhood watch meeting this Thursday 7pm at the community centre. All welcome.",
  },
  {
    email: "carlos@simplyserved.dev",
    hoursAgoCreated: 240,
    postType: PostType.GENERAL,
    contentText:
      "Anyone tried the new Ethiopian place on Mission? Saw it open last week and the smell walking by is unreal.",
  },
];

interface SeedBusiness {
  slug: string;
  name: string;
  description: string;
  category: string;
  phone: string;
  website: string;
  address: string;
  lat: number;
  lng: number;
}

// Net-new, unclaimed businesses — the kind the OSINT scraper discovers. Seeded
// near the default SF coords so the Vibe map + claim flow are demoable without
// running a live scrape.
const BUSINESSES: SeedBusiness[] = [
  {
    slug: "mission-bites-taqueria",
    name: "Mission Bites Taqueria",
    description:
      "Family-run taqueria slinging al pastor and handmade tortillas since 1998. Discovered via OpenStreetMap — owners, claim it to start taking bookings.",
    category: "Restaurant",
    phone: "+1 415-555-0142",
    website: "https://missionbites.example",
    address: "2451 Mission St, San Francisco, CA",
    lat: 37.7762,
    lng: -122.4188,
  },
  {
    slug: "valencia-cycle-works",
    name: "Valencia Cycle Works",
    description:
      "Neighborhood bike shop: tune-ups, flat repairs, and used-bike refurbs. Walk-ins welcome.",
    category: "Bike shop",
    phone: "+1 415-555-0177",
    website: "https://valenciacycle.example",
    address: "899 Valencia St, San Francisco, CA",
    lat: 37.7591,
    lng: -122.4216,
  },
  {
    slug: "dolores-bloom-florist",
    name: "Dolores Bloom Florist",
    description:
      "Seasonal arrangements and same-day delivery across the Mission. Aggregated from public listings.",
    category: "Florist",
    phone: "+1 415-555-0193",
    website: "https://doloresbloom.example",
    address: "3618 18th St, San Francisco, CA",
    lat: 37.7615,
    lng: -122.4267,
  },
];

async function main() {
  console.log("🌱 Seeding SimplyServed…");

  // Wipe existing demo data (idempotent re-runs).
  await prisma.ledgerEntry.deleteMany();
  await prisma.impression.deleteMany();
  await prisma.post.deleteMany();
  await prisma.message.deleteMany();
  await prisma.review.deleteMany();
  await prisma.serviceRequest.deleteMany();
  // BusinessProfile.claimedListingId references Listing, so clear profiles first.
  await prisma.businessProfile.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.user.deleteMany();

  // ── Create users + listings ────────────────────────────────────────────────
  const userMap = new Map<string, string>(); // email → id
  const allListings: { id: string; providerId: string; h3Neighborhood: string; lat: number; lng: number; hourlyRate: number }[] = [];

  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const created = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        consumerBalance: u.isConsumer ? 250 : 0,
        providerBalance: 0,
        consumerProfile: u.isConsumer ? { joinedAs: "consumer" } : undefined,
        providerProfile: u.isProvider
          ? { businessName: u.name, story: "", verified: true }
          : undefined,
      },
    });
    userMap.set(u.email, created.id);

    if (u.listings) {
      for (const l of u.listings) {
        const h3City = latLngToCell(l.lat, l.lng, RES_CITY);
        const h3Neighborhood = latLngToCell(l.lat, l.lng, RES_NEIGHBORHOOD);
        const listing = await prisma.listing.create({
          data: {
            providerId: created.id,
            title: l.title,
            description: l.description,
            category: l.category,
            hourlyRate: l.hourlyRate,
            lat: l.lat,
            lng: l.lng,
            h3City,
            h3Neighborhood,
          },
        });
        allListings.push({
          id: listing.id,
          providerId: created.id,
          h3Neighborhood,
          lat: l.lat,
          lng: l.lng,
          hourlyRate: l.hourlyRate,
        });

        // One business post per listing at varied ages.
        const ageHours = randInt(2, 200);
        await prisma.post.create({
          data: {
            userId: created.id,
            listingId: listing.id,
            postType: PostType.BUSINESS,
            contentText: `${listing.title} — ask about our weekend slots!`,
            mediaType: MediaType.TEXT_ONLY,
            lat: l.lat,
            lng: l.lng,
            h3Neighborhood,
            createdAt: hoursAgo(ageHours),
            updatedAt: hoursAgo(ageHours),
          },
        });
      }
    }
  }

  // ── Offer post for Ana ─────────────────────────────────────────────────────
  const anaId = userMap.get("ana@simplyserved.dev");
  const anaListing = anaId
    ? await prisma.listing.findFirst({ where: { providerId: anaId } })
    : null;
  if (anaId && anaListing) {
    await prisma.post.create({
      data: {
        userId: anaId,
        listingId: anaListing.id,
        postType: PostType.OFFER,
        contentText: "Tomorrow 7–9am: first 20 cold brews are FREE on our block!",
        mediaType: MediaType.TEXT_ONLY,
        lat: anaListing.lat,
        lng: anaListing.lng,
        h3Neighborhood: anaListing.h3Neighborhood,
        createdAt: hoursAgo(4),
        updatedAt: hoursAgo(4),
        metadata: {
          offer: {
            code: "FIRST20",
            discount: "100% off (first 20)",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
      },
    });
  }

  // ── Standalone community posts ─────────────────────────────────────────────
  for (const sp of STANDALONE_POSTS) {
    const userId = userMap.get(sp.email);
    if (!userId) continue;
    const lat = BASE_LAT + (Math.random() - 0.5) * 0.008;
    const lng = BASE_LNG + (Math.random() - 0.5) * 0.008;
    const h3Neighborhood = latLngToCell(lat, lng, RES_NEIGHBORHOOD);
    const t = hoursAgo(sp.hoursAgoCreated);
    await prisma.post.create({
      data: {
        userId,
        postType: sp.postType,
        contentText: sp.contentText,
        mediaType: MediaType.TEXT_ONLY,
        lat,
        lng,
        h3Neighborhood,
        createdAt: t,
        updatedAt: t,
      },
    });
  }

  // ── Impressions (simulate varied popularity) ───────────────────────────────
  // Tier boundaries: first third = hot, middle third = mid, last third = cold.
  const reactions: Reaction[] = [Reaction.LIKE, Reaction.LOVE, Reaction.WOW];
  const HOT_TIER_THRESHOLD = Math.floor(allListings.length / 3);
  const MID_TIER_THRESHOLD = Math.floor((allListings.length * 2) / 3);
  for (let i = 0; i < allListings.length; i++) {
    const l = allListings[i];
    const tier = i < HOT_TIER_THRESHOLD ? "hot" : i < MID_TIER_THRESHOLD ? "mid" : "cold";
    const count = tier === "hot" ? randInt(40, 120) : tier === "mid" ? randInt(8, 40) : randInt(0, 8);
    for (let j = 0; j < count; j++) {
      const reaction = reactions[j % reactions.length];
      const hash = fakeImpressionHash(l.id, `${j}`);
      await prisma.impression.create({
        data: {
          listingId: l.id,
          impressionHash: hash,
          reactionType: reaction,
        },
      });
    }
  }

  // ── Service requests + reviews ─────────────────────────────────────────────
  const consumers = ["carlos@simplyserved.dev", "jess@simplyserved.dev", "marco@simplyserved.dev"]
    .map((e) => userMap.get(e))
    .filter(Boolean) as string[];

  const sampleReviews = [
    { rating: 5, body: "Showed up early, super pro. Will rebook." },
    { rating: 5, body: "Made my whole block jealous. 10/10." },
    { rating: 4, body: "Solid work — would recommend to a neighbor." },
    { rating: 5, body: "Friendly, clean, and on time. Exactly what I hoped." },
    { rating: 4, body: null as string | null },
    { rating: 5, body: "Best $$$ I've spent this month." },
    { rating: 3, body: "Good but ran a bit late." },
    { rating: 5, body: "Exceptional — already booked again." },
    { rating: 4, body: "Very professional, minor issue with timing." },
    { rating: 5, body: "Couldn't be happier. 100% recommend." },
  ];

  // Give the first two-thirds of listings some completed requests + reviews.
  const listingsToReview = allListings.slice(0, Math.floor((allListings.length * 2) / 3));
  let reviewIdx = 0;
  for (const l of listingsToReview) {
    const reviewCount = randInt(1, 3);
    for (let r = 0; r < reviewCount; r++) {
      const consumerId = consumers[reviewIdx % consumers.length];
      const sample = sampleReviews[reviewIdx % sampleReviews.length];
      const daysAgo = randInt(2, 30);
      const fees = {
        base: l.hourlyRate,
        platformFee: Math.round(l.hourlyRate * 0.075 * 100) / 100,
        total: Math.round(l.hourlyRate * 1.075 * 100) / 100,
        hours: 1,
      };
      const req = await prisma.serviceRequest.create({
        data: {
          consumerId,
          listingId: l.id,
          status: "COMPLETED",
          feeDetails: fees,
          scheduledDate: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.review.create({
        data: {
          requestId: req.id,
          listingId: l.id,
          authorId: consumerId,
          providerId: l.providerId,
          rating: sample.rating,
          body: sample.body,
        },
      });
      reviewIdx++;
    }
  }

  // A few PLACED (not-yet-completed) requests for realistic pipeline.
  for (let i = 0; i < 5; i++) {
    const l = allListings[allListings.length - 1 - i];
    if (!l) continue;
    const consumerId = consumers[i % consumers.length];
    await prisma.serviceRequest.create({
      data: {
        consumerId,
        listingId: l.id,
        status: "PLACED",
        feeDetails: { base: l.hourlyRate, hours: 1 },
      },
    });
  }

  // ── Recompute rating aggregates ────────────────────────────────────────────
  for (const l of allListings) {
    const agg = await prisma.review.aggregate({
      where: { listingId: l.id },
      _avg: { rating: true },
      _count: { _all: true },
    });
    if (agg._count._all > 0) {
      await prisma.listing.update({
        where: { id: l.id },
        data: {
          ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10,
          ratingCount: agg._count._all,
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Seed unclaimed BusinessProfiles (OSINT-style) with an OpenStreetMap source.
  // ---------------------------------------------------------------------------
  for (const b of BUSINESSES) {
    await prisma.businessProfile.create({
      data: {
        slug: b.slug,
        name: b.name,
        description: b.description,
        category: b.category,
        phone: b.phone,
        website: b.website,
        address: b.address,
        city: "San Francisco",
        region: "CA",
        country: "US",
        lat: b.lat,
        lng: b.lng,
        h3City: latLngToCell(b.lat, b.lng, RES_CITY),
        h3Neighborhood: latLngToCell(b.lat, b.lng, RES_NEIGHBORHOOD),
        dedupeKey: `seed:${b.slug}`,
        claimStatus: "UNCLAIMED",
        sources: {
          create: {
            source: "OPENSTREETMAP",
            sourceUrl: `https://www.openstreetmap.org/?q=${encodeURIComponent(b.name)}`,
            rawPayload: { name: b.name, seeded: true },
          },
        },
      },
    });
  }

  console.log("✅ Seed complete.");
  console.log(`   ${allListings.length} listings · ${await prisma.post.count()} posts`);
  console.log(`   ${await prisma.impression.count()} impressions · ${await prisma.review.count()} reviews`);
  console.log("   Demo accounts (password: password123):");
  for (const u of USERS) console.log(`   - ${u.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
