"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  Compass,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  Tag,
  Briefcase,
  MessageSquare,
  Store,
  ArrowRight,
} from "lucide-react";
import { cellPolygon, indexCoords, neighborhoodCellsAround, cellCenter } from "@/lib/h3";
import {
  buildNearbyPlaces,
  DISCOVER_DEFAULT_RADIUS,
  DISCOVER_DEFAULT_SORT,
  DISCOVER_FEED_RING_BY_RADIUS,
  DISCOVER_RADIUS_OPTIONS,
  type DiscoverBusinessLike,
  type DiscoverListingLike,
  type DiscoverRingMiles,
  type DiscoverSort,
} from "@/lib/discover";
import { CreatePostModal, type ProviderListingOption } from "./CreatePostModal";
import { PostCard, type PostCardData } from "./PostCard";
import type {
  LeafletMapProps,
  DiscoveredBusiness,
  MapSelection,
} from "./LeafletMap";

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

interface Coords {
  lat: number;
  lng: number;
}

interface VibeMapProps {
  initialCoords: Coords;
  providerListings: ProviderListingOption[];
  signedIn: boolean;
}

type SmartFeedResponse = {
  total: number;
  timingMs?: number;
  feed: Array<
    | {
        kind: "post";
        id: string;
        score: number;
        postType: PostCardData["postType"];
        contentText: string;
        mediaType: PostCardData["mediaType"];
        mediaUrls: PostCardData["mediaUrls"];
        metadata?: PostCardData["metadata"];
        createdAt: string;
        lat: number;
        lng: number;
        user: PostCardData["user"];
        listing: PostCardData["listing"];
      }
    | (DiscoverListingLike & {
        kind: "listing";
        score: number;
      })
  >;
};

type SmartPostItem = Extract<SmartFeedResponse["feed"][number], { kind: "post" }>;
type SmartListingItem = Extract<SmartFeedResponse["feed"][number], { kind: "listing" }>;

export function VibeMap({ initialCoords, providerListings, signedIn }: VibeMapProps) {
  const [coords, setCoords] = useState<Coords>(initialCoords);
  const [posts, setPosts] = useState<PostCardData[]>([]);
  const [listings, setListings] = useState<DiscoverListingLike[]>([]);
  const [businesses, setBusinesses] = useState<DiscoverBusinessLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [feedSource, setFeedSource] = useState<"smart" | "legacy">("smart");
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [selected, setSelected] = useState<MapSelection>(null);
  const [liveBanner, setLiveBanner] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [sort, setSort] = useState<DiscoverSort>(DISCOVER_DEFAULT_SORT);
  const [ring, setRing] = useState<DiscoverRingMiles>(DISCOVER_DEFAULT_RADIUS);
  const esRef = useRef<EventSource | null>(null);

  const feedRing = DISCOVER_FEED_RING_BY_RADIUS[ring];
  const parsedMaxRate =
    maxRate.trim() === "" ? null : Math.max(0, Number.parseFloat(maxRate));

  const cells = useMemo(
    () => neighborhoodCellsAround(coords.lat, coords.lng, feedRing),
    [coords.lat, coords.lng, feedRing],
  );
  const myCell = useMemo(() => indexCoords(coords.lat, coords.lng).h3Neighborhood, [coords]);

  const refresh = async () => {
    setLoading(true);
    setFetchError(null);
    const feedParams = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      ring: String(feedRing),
    });
    const discoverParams = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      ring: String(ring),
    });
    if (category) discoverParams.set("category", category);
    if (maxRate.trim() !== "") discoverParams.set("maxRate", maxRate.trim());
    discoverParams.set("sort", sort === "recommended" ? "highest-rated" : sort);

    try {
      const smartParams = new URLSearchParams(feedParams);
      smartParams.set("limit", "60");
      const requestStartedAt = performance.now();
      const [smartRes, discoverRes] = await Promise.all([
        fetch(`/api/discover/smart?${smartParams}`),
        fetch(`/api/discover?${discoverParams}`),
      ]);

      if (!discoverRes.ok) {
        throw new Error(`Discover fetch failed (${discoverRes.status})`);
      }
      const discover = await discoverRes.json();
      setBusinesses(discover.businesses ?? []);

      if (!smartRes.ok) {
        throw new Error(`Smart Discover unavailable (${smartRes.status})`);
      }

      const smart = (await smartRes.json()) as SmartFeedResponse;
      const nextPosts = smart.feed.filter(
        (item): item is SmartPostItem => item.kind === "post",
      );
      const nextListings = smart.feed.filter(
        (item): item is SmartListingItem => item.kind === "listing",
      );

      setPosts(nextPosts);
      setListings(nextListings);
      setFeedSource("smart");
      console.info("[discover] smart_feed_loaded", {
        endpoint: "/api/discover/smart",
        results: smart.total,
        timingMs: Math.round(
          typeof smart.timingMs === "number"
            ? smart.timingMs
            : performance.now() - requestStartedAt,
        ),
      });
    } catch (smartError) {
      const fallbackStartedAt = performance.now();
      const [feedRes, discoverRes] = await Promise.all([
        fetch(`/api/feed?${feedParams}`),
        fetch(`/api/discover?${discoverParams}`),
      ]);
      if (!feedRes.ok || !discoverRes.ok) {
        setFetchError("Couldn’t load neighborhood data. Please try again.");
        return;
      }
      const [feed, discover] = await Promise.all([feedRes.json(), discoverRes.json()]);
      setPosts(feed.posts ?? []);
      setListings(discover.listings ?? []);
      setBusinesses(discover.businesses ?? []);
      setFeedSource("legacy");
      setFetchError("Smart ranking is temporarily unavailable. Showing standard results.");
      console.info("[discover] legacy_fallback_loaded", {
        endpoint: "/api/feed + /api/discover",
        results: (feed.posts?.length ?? 0) + (discover.listings?.length ?? 0),
        timingMs: Math.round(performance.now() - fallbackStartedAt),
        error: smartError instanceof Error ? smartError.message : "unknown",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.lat, coords.lng, category, maxRate, sort, ring]);

  useEffect(() => {
    esRef.current?.close();
    const params = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      ring: String(feedRing),
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
  }, [coords.lat, coords.lng, feedRing]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const cellGeoms = useMemo(() => {
    return cells.map((cell) => {
      const polygon = cellPolygon(cell);
      const center = cellCenter(cell);
      return { cell, polygon, center };
    });
  }, [cells]);

  const postCountsByCell = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      const c = indexCoords(p.lat ?? coords.lat, p.lng ?? coords.lng).h3Neighborhood;
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  const visiblePosts = activeCell
    ? posts.filter((p) => indexCoords(p.lat, p.lng).h3Neighborhood === activeCell)
    : posts;

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const listing of listings) values.add(listing.category);
    for (const business of businesses) {
      if (business.category) values.add(business.category);
    }
    if (category) values.add(category);
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [businesses, category, listings]);

  // TODO: Move category/maxRate/sort into /api/discover once the backend adds
  // indexed query support; keep this client-side fallback in sync until then.
  const nearbyPlaces = useMemo(
    () =>
      buildNearbyPlaces({
        listings,
        businesses,
        coords,
        category,
        maxRate:
          parsedMaxRate !== null && Number.isFinite(parsedMaxRate) ? parsedMaxRate : null,
        sort,
      }),
    [businesses, category, coords, listings, parsedMaxRate, sort],
  );

  const visibleListings = nearbyPlaces
    .filter((place) => place.kind === "listing")
    .map((place) => place.item);
  const visibleBusinesses = nearbyPlaces
    .filter((place) => place.kind === "business")
    .map((place) => place.item as DiscoveredBusiness);
  const nearbyCount = nearbyPlaces.length;

  useEffect(() => {
    if (!selected) return;
    const stillVisible = nearbyPlaces.some(
      (place) => place.kind === selected.kind && place.id === selected.id,
    );
    if (!stillVisible) setSelected(null);
  }, [nearbyPlaces, selected]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
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

        <div className="grid gap-3 border-b border-white/5 px-4 py-3 md:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/60">
              Category
            </span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="ss-input py-2"
              aria-label="Filter nearby places by category"
            >
              <option value="">All categories</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/60">
              Max hourly rate
            </span>
            <input
              type="number"
              min="0"
              step="5"
              inputMode="numeric"
              value={maxRate}
              onChange={(event) => setMaxRate(event.target.value)}
              placeholder="Any price"
              className="ss-input py-2"
              aria-label="Maximum hourly rate"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/60">
              Sort
            </span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as DiscoverSort)}
              className="ss-input py-2"
              aria-label="Sort nearby places"
            >
              <option value="recommended">Recommended</option>
              <option value="highest-rated">Highest Rated</option>
              <option value="newest">Newest</option>
              <option value="closest">Closest</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/60">
              Search radius
            </span>
            <select
              value={ring}
              onChange={(event) => setRing(Number(event.target.value) as DiscoverRingMiles)}
              className="ss-input py-2"
              aria-label="Search radius"
            >
              {DISCOVER_RADIUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} mile{option === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        </div>

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
            listings={visibleListings}
            businesses={visibleBusinesses}
            posts={posts}
            selected={selected}
            onSelect={setSelected}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-4 py-3 text-[11px] text-white/60">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-300" /> Listings
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" /> Businesses
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

      <section className="flex flex-col gap-4">
        <div className="ss-card flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-white">
              <Store size={14} className="text-emerald-300" />
              <span className="font-semibold">Nearby places</span>
              <span className="ss-chip">{nearbyCount}</span>
              <span className="ss-chip border-white/10 text-[10px] text-white/60">
                {feedSource === "smart" ? "Smart ranking" : "Standard ranking"}
              </span>
            </div>
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white"
              >
                Clear selection
              </button>
            )}
          </div>

          {fetchError && nearbyCount > 0 && (
            <p className="mx-4 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {fetchError}
            </p>
          )}

          {nearbyCount === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-white/50">
              {fetchError
                ? "Couldn’t load nearby places right now. Try refresh."
                : "No listings or businesses match these filters yet."}
            </p>
          ) : (
            <ul className="max-h-64 divide-y divide-white/5 overflow-y-auto">
              {nearbyPlaces.map((place) => {
                if (place.kind === "listing") {
                  const listing = place.item;
                  const isSel = selected?.kind === "listing" && selected.id === listing.id;
                  return (
                    <li key={listing.id}>
                      <button
                        onClick={() => setSelected(isSel ? null : { kind: "listing", id: listing.id })}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                          isSel ? "bg-indigo-500/15" : "hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-indigo-300" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-white">{listing.title}</span>
                          <span className="block truncate text-[11px] text-white/50">
                            {listing.category} · ${listing.hourlyRate}/hr · {listing.provider.name} ·{" "}
                            {place.distanceMiles.toFixed(1)} mi
                          </span>
                          {listing.rank?.label && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-medium text-fuchsia-200">
                              <Sparkles size={10} />
                              {listing.rank.label}
                            </span>
                          )}
                        </span>
                        {isSel && (
                          <Link
                            href={`/listings/${listing.id}`}
                            className="flex shrink-0 items-center gap-1 text-[11px] text-indigo-300 hover:underline"
                          >
                            View <ArrowRight size={11} />
                          </Link>
                        )}
                      </button>
                    </li>
                  );
                }

                const business = place.item;
                const isSel = selected?.kind === "business" && selected.id === business.id;
                return (
                  <li key={business.id}>
                    <button
                      onClick={() => setSelected(isSel ? null : { kind: "business", id: business.id })}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                        isSel ? "bg-emerald-500/15" : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">{business.name}</span>
                        <span className="block truncate text-[11px] text-white/50">
                          {business.category ?? "Local business"}
                          {business.city ? ` · ${business.city}` : ""} · {place.distanceMiles.toFixed(1)} mi
                        </span>
                      </span>
                      {isSel && (
                        <Link
                          href={`/businesses/${business.slug}`}
                          className="flex shrink-0 items-center gap-1 text-[11px] text-emerald-300 hover:underline"
                        >
                          View <ArrowRight size={11} />
                        </Link>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

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
        ) : fetchError && visiblePosts.length === 0 ? (
          <div className="ss-card p-8 text-center text-sm text-amber-100">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs">
              <AlertCircle size={12} />
              Feed issue
            </div>
            <p>{fetchError}</p>
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
