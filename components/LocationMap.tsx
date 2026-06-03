"use client";

/**
 * LocationMap — a small, themed single-pin map for detail pages.
 *
 * Client-only (Leaflet touches `window`); load it via a `ssr:false` dynamic
 * import. Kept separate from the interactive VibeMap so detail pages stay light.
 */
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";

export interface LocationMapProps {
  lat: number;
  lng: number;
  /** Accent color for the pin; defaults to the brand emerald used for businesses. */
  color?: string;
  zoom?: number;
}

export function LocationMap({ lat, lng, color = "#34d399", zoom = 15 }: LocationMapProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={zoom}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <CircleMarker
        center={[lat, lng]}
        radius={9}
        pathOptions={{ fillColor: color, fillOpacity: 1, color: "#fff", weight: 3 }}
      />
    </MapContainer>
  );
}
