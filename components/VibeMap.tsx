"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, Loader2, MapPin, Plus, RefreshCw, Tag, Briefcase, MessageSquare } from "lucide-react";
import { cellPolygon, indexCoords, neighborhoodCellsAround, cellCenter } from "@/lib/h3";
import { CreatePostModal, type ProviderListingOption } from "./CreatePostModal";
import { PostCard, type PostCardData } from "./PostCard";

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

  // -- Compute SVG hex projection ------------------------------------------
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

  // Project lat/lng → SVG x/y around the user's center.
  const SIZE = 480;
  const SCALE = 60_000; // pixels per degree (approx for a small region)
  const project = (lat: number, lng: number): [number, number] => {
    const dx = (lng - coords.lng) * Math.cos((coords.lat * Math.PI) / 180);
    const dy = coords.lat - lat;
    return [SIZE / 2 + dx * SCALE, SIZE / 2 + dy * SCALE];
  };

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

        {liveBanner && (
          <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 animate-fade-in rounded-full bg-indigo-500/90 px-3 py-1 text-xs font-medium text-white shadow-lg">
            {liveBanner}
          </div>
        )}

        <div className="relative aspect-square w-full">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full">
            <defs>
              <radialGradient id="hex-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(236,72,153,0.35)" />
                <stop offset="100%" stopColor="rgba(99,102,241,0.05)" />
              </radialGradient>
            </defs>

            {cellGeoms.map(({ cell, polygon }) => {
              const points = polygon.map(([lat, lng]) => project(lat, lng).join(",")).join(" ");
              const count = postCountsByCell.get(cell) ?? 0;
              const isMine = cell === myCell;
              const isActive = cell === activeCell;
              const intensity = Math.min(count / 4, 1);
              const fill = isActive
                ? "rgba(236,72,153,0.35)"
                : isMine
                  ? "rgba(99,102,241,0.25)"
                  : `rgba(99,102,241,${0.05 + intensity * 0.25})`;
              return (
                <polygon
                  key={cell}
                  points={points}
                  fill={fill}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1}
                  className="cursor-pointer transition-all hover:fill-fuchsia-500/30"
                  onClick={() => setActiveCell(isActive ? null : cell)}
                />
              );
            })}

            {/* Listings */}
            {listings.map((l) => {
              const [x, y] = project(l.lat, l.lng);
              return (
                <g key={l.id}>
                  <circle cx={x} cy={y} r={6} fill="#a5b4fc" />
                  <circle cx={x} cy={y} r={6} fill="#a5b4fc" opacity={0.4} className="animate-pulse-ring" />
                </g>
              );
            })}

            {/* Posts (visualized as small dots) */}
            {posts.map((p) => {
              const [x, y] = project(p.lat, p.lng);
              const color =
                p.postType === "OFFER" ? "#f472b6" : p.postType === "BUSINESS" ? "#fbbf24" : "#7dd3fc";
              return <circle key={p.id} cx={x} cy={y} r={3.5} fill={color} />;
            })}

            {/* You */}
            {(() => {
              const [x, y] = project(coords.lat, coords.lng);
              return (
                <g>
                  <circle cx={x} cy={y} r={9} fill="url(#hex-glow)" />
                  <circle cx={x} cy={y} r={5} fill="#fff" />
                  <circle cx={x} cy={y} r={5} fill="#fff" opacity={0.5} className="animate-pulse-ring" />
                </g>
              );
            })()}
          </svg>
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
