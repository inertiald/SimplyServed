"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin } from "lucide-react";
import { createListingAction } from "@/app/actions/listings";
import type { ActionResult } from "@/app/actions/auth";

const CATEGORIES = [
  "Home services",
  "Beauty & wellness",
  "Tutoring",
  "Pet care",
  "Food & catering",
  "Fitness",
  "Repair & handywork",
  "Creative",
  "Tech help",
  "Events",
];

export default function NewListingPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    createListingAction,
    undefined,
  );
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (state?.ok) {
      const data = state.data as { id: string };
      router.push(`/listings/${data.id}`);
    }
  }, [state, router]);

  const useCurrent = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="ss-card mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold text-white">Create a listing</h1>
      <p className="mt-1 text-sm text-white/60">
        It will appear on the Vibe map for neighbors in your hex cell.
      </p>

      <form action={action} className="mt-6 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="ss-label" htmlFor="title">Title</label>
          <input id="title" name="title" required className="ss-input" placeholder="Same-day bike repair" />
        </div>
        <div className="col-span-2">
          <label className="ss-label" htmlFor="description">Description</label>
          <textarea id="description" name="description" required rows={4} className="ss-input resize-none" minLength={20} maxLength={4000} />
        </div>
        <div>
          <label className="ss-label" htmlFor="category">Category</label>
          <select id="category" name="category" required className="ss-input">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ss-label" htmlFor="hourlyRate">Hourly rate (USD)</label>
          <input id="hourlyRate" name="hourlyRate" type="number" min={1} max={10000} step="0.01" required className="ss-input" />
        </div>
        <div>
          <label className="ss-label" htmlFor="lat">Latitude</label>
          <input id="lat" name="lat" type="number" step="any" required className="ss-input" value={coords?.lat ?? ""} onChange={(e) => setCoords((c) => ({ lat: Number(e.target.value), lng: c?.lng ?? 0 }))} />
        </div>
        <div>
          <label className="ss-label" htmlFor="lng">Longitude</label>
          <input id="lng" name="lng" type="number" step="any" required className="ss-input" value={coords?.lng ?? ""} onChange={(e) => setCoords((c) => ({ lat: c?.lat ?? 0, lng: Number(e.target.value) }))} />
        </div>
        <div className="col-span-2">
          <button type="button" onClick={useCurrent} className="ss-btn-ghost text-xs">
            <MapPin size={12} /> Use my current location
          </button>
        </div>

        {state && !state.ok && <p className="col-span-2 text-sm text-rose-300">{state.error}</p>}

        <div className="col-span-2 flex justify-end">
          <button type="submit" disabled={pending} className="ss-btn-primary">
            {pending && <Loader2 size={14} className="animate-spin" />}
            Publish listing
          </button>
        </div>
      </form>
    </div>
  );
}
