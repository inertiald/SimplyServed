"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { adminDecideClaimAction } from "@/app/actions/claims";
import type { ActionResult } from "@/app/actions/auth";

export interface AdminClaimRowProps {
  claimId: string;
  method: string;
  submittedAt: string;
  business: { name: string; slug: string; website: string | null; phone: string | null };
  payload: unknown;
}

export function AdminClaimRow(props: AdminClaimRowProps) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    adminDecideClaimAction,
    undefined,
  );
  const docUrl =
    (props.payload as { docUrl?: string } | null)?.docUrl ?? null;

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/businesses/${props.business.slug}`}
            className="text-sm font-semibold text-white hover:text-indigo-300"
          >
            {props.business.name}
          </Link>
          <div className="mt-1 text-xs text-white/50">
            via {props.method} · submitted {new Date(props.submittedAt).toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-white/60">
            {props.business.website && (
              <a href={props.business.website} target="_blank" rel="noreferrer" className="mr-3 text-indigo-300 hover:underline">
                website
              </a>
            )}
            {props.business.phone && <span className="mr-3">tel: {props.business.phone}</span>}
            {docUrl && (
              <a href={docUrl} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">
                document
              </a>
            )}
          </div>
        </div>
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="claimId" value={props.claimId} />
          <button name="decision" value="APPROVE" disabled={pending} className="ss-btn-primary">
            {pending && <Loader2 size={14} className="animate-spin" />}
            Approve
          </button>
          <button
            name="decision"
            value="REJECT"
            disabled={pending}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
          >
            Reject
          </button>
        </form>
      </div>
      {state && !state.ok && <p className="mt-2 text-xs text-rose-300">{state.error}</p>}
    </li>
  );
}
