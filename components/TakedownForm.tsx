"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { requestTakedownAction } from "@/app/actions/claims";
import type { ActionResult } from "@/app/actions/auth";

export function TakedownForm({ profileId }: { profileId: string }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    requestTakedownAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <p role="status" aria-live="polite" className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">
        Thanks — this profile has been tombstoned and won&apos;t be re-ingested.
      </p>
    );
  }

  return (
    <form action={action} className="ss-card flex flex-col gap-3 p-5">
      <input type="hidden" name="profileId" value={profileId} />
      <label className="ss-label" htmlFor="reason">Why are you requesting removal?</label>
      <textarea
        id="reason"
        name="reason"
        rows={4}
        required
        minLength={3}
        maxLength={500}
        className="ss-input resize-none"
        placeholder="e.g. business is closed, copyright concern, incorrect data…"
        aria-invalid={Boolean(state && !state.ok)}
        aria-describedby={state && !state.ok ? "takedown-error" : undefined}
      />
      {state && !state.ok && <p id="takedown-error" role="alert" className="text-sm text-rose-300">{state.error}</p>}
      <button type="submit" disabled={pending} className="ss-btn-primary">
        {pending && <Loader2 size={14} className="animate-spin" />}
        Submit removal request
      </button>
    </form>
  );
}
