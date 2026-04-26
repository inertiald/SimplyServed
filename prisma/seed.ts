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

async function main() {
  console.log("🌱 Seeding SimplyServed…");

  // Wipe existing demo data (idempotent re-runs).
  await prisma.ledgerEntry.deleteMany();
  await prisma.impression.deleteMany();
  await prisma.post.deleteMany();
  await prisma.serviceRequest.deleteMany();
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
