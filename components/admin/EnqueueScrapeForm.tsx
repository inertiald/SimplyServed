"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { enqueueScrapeJobAction } from "@/app/actions/scraping";
import type { ActionResult } from "@/app/actions/auth";
import type { ScrapeSource } from "@prisma/client";

const ALL_SOURCES: ScrapeSource[] = [
  "OPENSTREETMAP",
  "YELP",
  "GOOGLE",
  "CHAMBER",
  "BBB",
  "YELLOWPAGES",
  "FACEBOOK",
  "INSTAGRAM",
  "OTHER",
];

export function EnqueueScrapeForm({ enabledSources }: { enabledSources: ScrapeSource[] }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    enqueueScrapeJobAction,
    undefined,
  );
  const enabledSet = new Set(enabledSources);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-xs text-white/60">
        Source
        <select name="source" className="ss-input mt-1 w-44" defaultValue="OPENSTREETMAP">
          {ALL_SOURCES.map((s) => (
            <option key={s} value={s} disabled={!enabledSet.has(s)}>
              {s} {enabledSet.has(s) ? "" : "(disabled)"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-1 flex-col text-xs text-white/60">
        Target (city slug, query, etc.)
        <input
          name="target"
          required
          className="ss-input mt-1"
          placeholder="sf-mission"
          defaultValue="sf-mission"
        />
      </label>
      <input type="hidden" name="runNow" value="true" />
      <button type="submit" disabled={pending} className="ss-btn-primary">
        {pending && <Loader2 size={14} className="animate-spin" />}
        Run now
      </button>
      {state && !state.ok && <span className="text-xs text-rose-300">{state.error}</span>}
      {state?.ok && <span className="text-xs text-emerald-300">Queued.</span>}
    </form>
  );
}
