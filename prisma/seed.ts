import { PrismaClient, PostType, MediaType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { latLngToCell } from "h3-js";

const prisma = new PrismaClient();

const RES_CITY = 7;
const RES_NEIGHBORHOOD = 9;

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
        lat: 37.7745,
        lng: -122.4189,
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
        lat: 37.7755,
        lng: -122.4180,
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
        lat: 37.7770,
        lng: -122.4200,
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
        lat: 37.7730,
        lng: -122.4170,
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

  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const created = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        // Pre-load demo wallets so the booking flow works end-to-end on first run.
        consumerBalance: u.isConsumer ? 250 : 0,
        providerBalance: 0,
        consumerProfile: u.isConsumer ? { joinedAs: "consumer" } : undefined,
        providerProfile: u.isProvider
          ? { businessName: u.name, story: "", verified: true }
          : undefined,
      },
    });

    if (u.listings) {
      for (const l of u.listings) {
        const listing = await prisma.listing.create({
          data: {
            providerId: created.id,
            title: l.title,
            description: l.description,
            category: l.category,
            hourlyRate: l.hourlyRate,
            lat: l.lat,
            lng: l.lng,
            h3City: latLngToCell(l.lat, l.lng, RES_CITY),
            h3Neighborhood: latLngToCell(l.lat, l.lng, RES_NEIGHBORHOOD),
          },
        });

        // Seed a couple of posts per listing.
        await prisma.post.create({
          data: {
            userId: created.id,
            listingId: listing.id,
            postType: PostType.BUSINESS,
            contentText: `${listing.title} — ask about our weekend slots!`,
            mediaType: MediaType.TEXT_ONLY,
            lat: l.lat,
            lng: l.lng,
            h3Neighborhood: listing.h3Neighborhood,
          },
        });
      }
    }
  }

  // A live offer post.
  const ana = await prisma.user.findUnique({ where: { email: "ana@simplyserved.dev" } });
  const anaListing = ana
    ? await prisma.listing.findFirst({ where: { providerId: ana.id } })
    : null;
  if (ana && anaListing) {
    await prisma.post.create({
      data: {
        userId: ana.id,
        listingId: anaListing.id,
        postType: PostType.OFFER,
        contentText: "Tomorrow 7–9am: first 20 cold brews are FREE on our block!",
        mediaType: MediaType.TEXT_ONLY,
        lat: anaListing.lat,
        lng: anaListing.lng,
        h3Neighborhood: anaListing.h3Neighborhood,
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

  // A general neighborhood post.
  const carlos = await prisma.user.findUnique({ where: { email: "carlos@simplyserved.dev" } });
  if (carlos) {
    const lat = 37.7748;
    const lng = -122.4185;
    await prisma.post.create({
      data: {
        userId: carlos.id,
        postType: PostType.GENERAL,
        contentText:
          "Saturday morning park cleanup at Mission Dolores — bring gloves, we&apos;ll bring bags + coffee ☕",
        mediaType: MediaType.TEXT_ONLY,
        lat,
        lng,
        h3Neighborhood: latLngToCell(lat, lng, RES_NEIGHBORHOOD),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Seed a small history of completed bookings + reviews so the discover UI
  // and provider profiles light up out of the box.
  // ---------------------------------------------------------------------------
  const consumerForReviews = carlos; // already fetched above
  if (consumerForReviews) {
    const featured = await prisma.listing.findMany({
      where: { providerId: { not: consumerForReviews.id } },
      take: 6,
      orderBy: { createdAt: "asc" },
    });
    const sampleReviews = [
      { rating: 5, body: "Showed up early, super pro. Will rebook." },
      { rating: 5, body: "Made my whole block jealous. 10/10." },
      { rating: 4, body: "Solid work — would recommend to a neighbor." },
      { rating: 5, body: "Friendly, clean, and on time. Exactly what I hoped." },
      { rating: 4, body: null as string | null },
      { rating: 5, body: "Best $$$ I've spent this month." },
    ];
    for (let i = 0; i < featured.length; i++) {
      const l = featured[i];
      const sample = sampleReviews[i % sampleReviews.length];
      const fees = {
        base: l.hourlyRate,
        platformFee: Math.round(l.hourlyRate * 0.075 * 100) / 100,
        total: Math.round(l.hourlyRate * 1.075 * 100) / 100,
        hours: 1,
      };
      const req = await prisma.serviceRequest.create({
        data: {
          consumerId: consumerForReviews.id,
          listingId: l.id,
          status: "COMPLETED",
          feeDetails: fees,
          scheduledDate: new Date(Date.now() - (i + 2) * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.review.create({
        data: {
          requestId: req.id,
          listingId: l.id,
          authorId: consumerForReviews.id,
          providerId: l.providerId,
          rating: sample.rating,
          body: sample.body,
        },
      });
    }
    // Recompute aggregates for the listings we just touched.
    for (const l of featured) {
      const agg = await prisma.review.aggregate({
        where: { listingId: l.id },
        _avg: { rating: true },
        _count: { _all: true },
      });
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
