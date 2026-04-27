import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { VibeMap } from "@/components/VibeMap";
import { VibePulse } from "@/components/VibePulse";

export const dynamic = "force-dynamic";

// Default coords = San Francisco-ish; client immediately offers to use real geolocation.
const DEFAULT_COORDS = { lat: 37.7749, lng: -122.4194 };

export default async function VibePage() {
  const user = await getSessionUser();
  const providerListings = user
    ? await prisma.listing.findMany({
        where: { providerId: user.id, status: { not: "INACTIVE" } },
        select: { id: true, title: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-white">Neighborhood Vibe</h1>
        <p className="text-sm text-white/60">
          Posts and listings around you, indexed by H3 hex cells. Tap a cell to filter.
        </p>
      </header>

      <VibePulse />

      <VibeMap
        initialCoords={DEFAULT_COORDS}
        providerListings={providerListings}
        signedIn={Boolean(user)}
      />
    </div>
  );
}
