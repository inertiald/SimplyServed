"use client";

/**
 * LeafletMap — real interactive basemap backed by OpenStreetMap tiles.
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
  useMap,
} from "react-leaflet";
import type { PostCardData } from "./PostCard";

export interface CellGeom {
  cell: string;
  polygon: [number, number][];
}

export interface DiscoveredListing {
  id: string;
  lat: number;
  lng: number;
}

export interface LeafletMapProps {
  coords: { lat: number; lng: number };
  cellGeoms: CellGeom[];
  myCell: string;
  activeCell: string | null;
  onCellClick: (cell: string) => void;
  postCountsByCell: Map<string, number>;
  listings: DiscoveredListing[];
  posts: PostCardData[];
}

/** Re-centers the Leaflet map whenever the user's coordinates change. */
function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
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
  posts,
}: LeafletMapProps) {
  return (
    <MapContainer
      center={[coords.lat, coords.lng]}
      zoom={14}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <MapRecenter lat={coords.lat} lng={coords.lng} />

      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* H3 neighborhood cells */}
      {cellGeoms.map(({ cell, polygon }) => {
        const count = postCountsByCell.get(cell) ?? 0;
        const isMine = cell === myCell;
        const isActive = cell === activeCell;
        const intensity = Math.min(count / 4, 1);
        const fillColor = isActive
          ? "#ec4899"
          : isMine
            ? "#6366f1"
            : "#6366f1";
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
      {listings.map((l) => (
        <CircleMarker
          key={l.id}
          center={[l.lat, l.lng]}
          radius={6}
          pathOptions={{
            fillColor: "#a5b4fc",
            fillOpacity: 1,
            color: "#a5b4fc",
            weight: 1,
          }}
        />
      ))}

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
