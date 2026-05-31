"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Compass, Loader2, MapPin, Plus, RefreshCw, Tag, Briefcase, MessageSquare } from "lucide-react";
import { cellPolygon, indexCoords, neighborhoodCellsAround, cellCenter } from "@/lib/h3";
import { CreatePostModal, type ProviderListingOption } from "./CreatePostModal";
import { PostCard, type PostCardData } from "./PostCard";
import type { LeafletMapProps } from "./LeafletMap";

// Leaflet touches `window` — load it client-side only.
const LeafletMapDynamic = dynamic<LeafletMapProps>(
  () => import("./LeafletMap").then((mod) => mod.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-white/40">
        <Loader2 className="animate-spin" />
      </div>
    ),
  },
);

interface DiscoveredListing {
  id: string;
  title: string;
  category: string;
  hourlyRate: number;
  lat: number;
  lng: number;
  h3Neighborhood: string;
  provider: { name: string };
  _count: { impressions: number; requests: number };
}

interface Coords {
  lat: number;
  lng: number;
}

interface VibeMapProps {
  initialCoords: Coords;
  providerListings: ProviderListingOption[];
  signedIn: boolean;
}

const RING = 2;

export function VibeMap({ initialCoords, providerListings, signedIn }: VibeMapProps) {
  const [coords, setCoords] = useState<Coords>(initialCoords);
  const [posts, setPosts] = useState<PostCardData[]>([]);
  const [listings, setListings] = useState<DiscoveredListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [liveBanner, setLiveBanner] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const cells = useMemo(
    () => neighborhoodCellsAround(coords.lat, coords.lng, RING),
    [coords.lat, coords.lng],
  );
  const myCell = useMemo(() => indexCoords(coords.lat, coords.lng).h3Neighborhood, [coords]);

  // -- Fetch feed + discover ------------------------------------------------
  const refresh = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        lat: String(coords.lat),
        lng: String(coords.lng),
        ring: String(RING),
      });
      const [feedRes, discoverRes] = await Promise.all([
        fetch(`/api/feed?${params}`),
        fetch(`/api/discover?${params}`),
      ]);
      const feed = await feedRes.json();
      const discover = await discoverRes.json();
      setPosts(feed.posts ?? []);
      setListings(discover.listings ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.lat, coords.lng]);

  // -- Realtime SSE ---------------------------------------------------------
  useEffect(() => {
    esRef.current?.close();
    const params = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      ring: String(RING),
    });
    const es = new EventSource(`/api/realtime?${params}`);
    esRef.current = es;
    es.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        const payload = data?.payload;
        if (payload?.type === "post.created" && payload.post) {
          setPosts((prev) => [payload.post, ...prev.filter((p) => p.id !== payload.post.id)]);
          setLiveBanner(`New post by ${payload.post.user?.name ?? "a neighbor"}`);
          setTimeout(() => setLiveBanner(null), 3500);
        }
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("error", () => {
      // Browser will retry automatically; nothing to do.
    });
    return () => es.close();
  }, [coords.lat, coords.lng]);

  // Geolocate
  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  // -- Compute Leaflet overlay geometry ------------------------------------
  const cellGeoms = useMemo(() => {
    return cells.map((cell) => {
      const polygon = cellPolygon(cell); // [[lat, lng], …]
      const center = cellCenter(cell);
      return { cell, polygon, center };
    });
  }, [cells]);

  const postCountsByCell = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      // h3Neighborhood is on the post but not in PostCardData; recompute defensively.
      // We rely on grouping by (lat,lng) → re-index here.
      const c = indexCoords(p.lat ?? coords.lat, p.lng ?? coords.lng).h3Neighborhood;
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  const visiblePosts = activeCell
    ? posts.filter((p) => indexCoords(p.lat, p.lng).h3Neighborhood === activeCell)
    : posts;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
      {/* MAP */}
      <section className="ss-card relative overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-white">
            <Compass size={14} className="text-indigo-300" />
            <span className="font-semibold">Neighborhood Vibe</span>
            <span className="ss-chip">cell {myCell.slice(0, 6)}…</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={useMyLocation} className="ss-btn-ghost text-xs">
              <MapPin size={12} /> My location
            </button>
            <button onClick={refresh} className="ss-btn-ghost text-xs" disabled={loading}>
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh
            </button>
          </div>
        </div>

        {/* z-[500] keeps the banner above Leaflet's tile layer (z-index ~400) */}
        {liveBanner && (
          <div className="absolute left-1/2 top-16 z-[500] -translate-x-1/2 animate-fade-in rounded-full bg-indigo-500/90 px-3 py-1 text-xs font-medium text-white shadow-lg">
            {liveBanner}
          </div>
        )}

        <div className="relative aspect-square w-full overflow-hidden">
          <LeafletMapDynamic
            coords={coords}
            cellGeoms={cellGeoms}
            myCell={myCell}
            activeCell={activeCell}
            onCellClick={(cell) => setActiveCell(activeCell === cell ? null : cell)}
            postCountsByCell={postCountsByCell}
            listings={listings}
            posts={posts}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-4 py-3 text-[11px] text-white/60">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-300" /> Listings
          </span>
          <span className="flex items-center gap-1.5">
            <MessageSquare size={11} className="text-sky-300" /> General
          </span>
          <span className="flex items-center gap-1.5">
            <Briefcase size={11} className="text-amber-300" /> Business
          </span>
          <span className="flex items-center gap-1.5">
            <Tag size={11} className="text-fuchsia-300" /> Offer
          </span>
          {activeCell && (
            <button
              onClick={() => setActiveCell(null)}
              className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white"
            >
              Clear cell filter
            </button>
          )}
        </div>
      </section>

      {/* FEED */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {activeCell ? "Posts in this cell" : "What's happening nearby"}
          </h2>
          {signedIn && (
            <button onClick={() => setComposeOpen(true)} className="ss-btn-primary text-xs">
              <Plus size={12} /> New post
            </button>
          )}
        </div>

        {loading && posts.length === 0 ? (
          <div className="ss-card grid place-items-center p-12 text-white/50">
            <Loader2 className="animate-spin" />
          </div>
        ) : visiblePosts.length === 0 ? (
          <div className="ss-card p-8 text-center text-sm text-white/60">
            No posts yet in this area. Be the first to share!
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visiblePosts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </section>

      {signedIn && (
        <CreatePostModal
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          lat={coords.lat}
          lng={coords.lng}
          providerListings={providerListings}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
