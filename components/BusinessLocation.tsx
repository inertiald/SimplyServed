"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { LocationMapProps } from "./LocationMap";

// Leaflet touches `window` — load the map client-side only.
const LocationMapDynamic = dynamic<LocationMapProps>(
  () => import("./LocationMap").then((mod) => mod.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-white/40">
        <Loader2 className="animate-spin" />
      </div>
    ),
  },
);

/**
 * Client wrapper so server components can embed the themed single-pin map
 * (a `ssr:false` dynamic import is only valid inside a Client Component).
 */
export function BusinessLocation({ lat, lng, label }: { lat: number; lng: number; label?: string }) {
  return (
    <div className="ss-card overflow-hidden">
      <div className="aspect-[16/9] w-full">
        <LocationMapDynamic lat={lat} lng={lng} />
      </div>
      {label && (
        <div className="border-t border-white/5 px-4 py-2.5 text-xs text-white/60">{label}</div>
      )}
    </div>
  );
}
