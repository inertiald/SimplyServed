"use client";

/**
 * LeafletMap — real interactive basemap backed by dark-themed tiles.
 *
 * This file must only be loaded client-side (Leaflet accesses `window`).
 * Import it via `dynamic(() => import("./LeafletMap"), { ssr: false })`.
 */
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import type { PostCardData } from "./PostCard";

export interface CellGeom {
  cell: string;
  polygon: [number, number][];
}

export interface DiscoveredListing {
  id: string;
  title?: string;
  category?: string;
  hourlyRate?: number;
  provider?: { name: string };
  lat: number;
  lng: number;
}

export interface DiscoveredBusiness {
  id: string;
  slug: string;
  name: string;
  category?: string | null;
  city?: string | null;
  region?: string | null;
  lat: number;
  lng: number;
}

/** A currently-selected pin, shared between the map and the side list. */
export type MapSelection =
  | { kind: "listing"; id: string }
  | { kind: "business"; id: string }
  | null;

export interface LeafletMapProps {
  coords: { lat: number; lng: number };
  cellGeoms: CellGeom[];
  myCell: string;
  activeCell: string | null;
  onCellClick: (cell: string) => void;
  postCountsByCell: Map<string, number>;
  listings: DiscoveredListing[];
  businesses: DiscoveredBusiness[];
  posts: PostCardData[];
  selected: MapSelection;
  onSelect: (selection: MapSelection) => void;
}

/** Re-centers the Leaflet map whenever the user's coordinates change. */
function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

/** Smoothly flies the map to the currently-selected pin. */
function FlyToSelection({
  lat,
  lng,
}: {
  lat: number | null;
  lng: number | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (lat == null || lng == null) return;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [lat, lng, map]);
  return null;
}

export function LeafletMap({
  coords,
  cellGeoms,
  myCell,
  activeCell,
  onCellClick,
  postCountsByCell,
  listings,
  businesses,
  posts,
  selected,
  onSelect,
}: LeafletMapProps) {
  const selectedListing =
    selected?.kind === "listing"
      ? listings.find((l) => l.id === selected.id)
      : undefined;
  const selectedBusiness =
    selected?.kind === "business"
      ? businesses.find((b) => b.id === selected.id)
      : undefined;
  const focus = selectedListing ?? selectedBusiness ?? null;

  return (
    <MapContainer
      center={[coords.lat, coords.lng]}
      zoom={14}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <MapRecenter lat={coords.lat} lng={coords.lng} />
      <FlyToSelection lat={focus?.lat ?? null} lng={focus?.lng ?? null} />

      {/* Dark CARTO basemap keeps the map on-brand with the app's UI. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {/* H3 neighborhood cells */}
      {cellGeoms.map(({ cell, polygon }) => {
        const count = postCountsByCell.get(cell) ?? 0;
        const isMine = cell === myCell;
        const isActive = cell === activeCell;
        const intensity = Math.min(count / 4, 1);
        const fillColor = isActive ? "#ec4899" : "#6366f1";
        const fillOpacity = isActive
          ? 0.35
          : isMine
            ? 0.25
            : 0.05 + intensity * 0.25;

        return (
          <Polygon
            key={cell}
            positions={polygon}
            pathOptions={{
              fillColor,
              fillOpacity,
              color: "rgba(255,255,255,0.15)",
              weight: 1,
            }}
            eventHandlers={{
              click: () => onCellClick(cell),
            }}
          />
        );
      })}

      {/* Listings (indigo dots) */}
      {listings.map((l) => {
        const isSelected = selected?.kind === "listing" && selected.id === l.id;
        return (
          <CircleMarker
            key={l.id}
            center={[l.lat, l.lng]}
            radius={isSelected ? 10 : 6}
            pathOptions={{
              fillColor: "#a5b4fc",
              fillOpacity: 1,
              color: isSelected ? "#fff" : "#a5b4fc",
              weight: isSelected ? 3 : 1,
            }}
            eventHandlers={{ click: () => onSelect({ kind: "listing", id: l.id }) }}
          >
            <Popup>
              <div className="ss-popup">
                <p className="ss-popup-title">{l.title ?? "Listing"}</p>
                {l.category && <p className="ss-popup-meta">{l.category}</p>}
                {l.provider?.name && (
                  <p className="ss-popup-meta">by {l.provider.name}</p>
                )}
                <a className="ss-popup-link" href={`/listings/${l.id}`}>
                  View profile →
                </a>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Discovered businesses (emerald dots) */}
      {businesses.map((b) => {
        const isSelected = selected?.kind === "business" && selected.id === b.id;
        return (
          <CircleMarker
            key={b.id}
            center={[b.lat, b.lng]}
            radius={isSelected ? 10 : 6}
            pathOptions={{
              fillColor: "#34d399",
              fillOpacity: 1,
              color: isSelected ? "#fff" : "#34d399",
              weight: isSelected ? 3 : 1,
            }}
            eventHandlers={{ click: () => onSelect({ kind: "business", id: b.id }) }}
          >
            <Popup>
              <div className="ss-popup">
                <p className="ss-popup-title">{b.name}</p>
                <p className="ss-popup-meta">
                  {b.category ?? "Local business"}
                  {b.city ? ` · ${b.city}` : ""}
                </p>
                <a className="ss-popup-link" href={`/businesses/${b.slug}`}>
                  View profile →
                </a>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Posts (color-coded by type) */}
      {posts.map((p) => {
        const color =
          p.postType === "OFFER"
            ? "#f472b6"
            : p.postType === "BUSINESS"
              ? "#fbbf24"
              : "#7dd3fc";
        return (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={4}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.9,
              color,
              weight: 1,
            }}
          />
        );
      })}

      {/* You are here */}
      <CircleMarker
        center={[coords.lat, coords.lng]}
        radius={8}
        pathOptions={{
          fillColor: "#fff",
          fillOpacity: 1,
          color: "#6366f1",
          weight: 3,
        }}
      />
    </MapContainer>
  );
}
