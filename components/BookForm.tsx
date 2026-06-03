"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createServiceRequestAction } from "@/app/actions/requests";
import type { ActionResult } from "@/app/actions/auth";
import { calculateFees } from "@/lib/payments";
import { useState } from "react";

export function BookForm({ listingId, hourlyRate }: { listingId: string; hourlyRate: number }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    createServiceRequestAction,
    undefined,
  );
  const [hours, setHours] = useState(1);
  const fees = calculateFees(hourlyRate, hours);

  useEffect(() => {
    if (state?.ok) {
      router.push("/dashboard/consumer");
    }
  }, [state, router]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="listingId" value={listingId} />

      <div>
        <label className="ss-label" htmlFor="hours">Hours</label>
        <input
          id="hours"
          name="hours"
          type="number"
          min={1}
          max={24}
          value={hours}
          onChange={(e) => setHours(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
          className="ss-input"
        />
      </div>

      <div>
        <label className="ss-label" htmlFor="scheduledDate">When?</label>
        <input id="scheduledDate" name="scheduledDate" type="datetime-local" className="ss-input" />
      </div>

      <div>
        <label className="ss-label" htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={2} className="ss-input resize-none" />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
        <div className="flex justify-between text-white/70">
          <span>Subtotal</span>
          <span>${fees.base.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-white/70">
          <span>Platform fee</span>
          <span>${fees.platformFee.toFixed(2)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-white/10 pt-1 font-semibold text-white">
          <span>Total</span>
          <span>${fees.total.toFixed(2)}</span>
        </div>
      </div>

      {state && !state.ok && <p className="text-sm text-rose-300">{state.error}</p>}

      <button type="submit" disabled={pending} className="ss-btn-primary">
        {pending && <Loader2 size={14} className="animate-spin" />}
        Place request
      </button>
    </form>
  );
}
