"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { RequestStatus } from "@prisma/client";
import { transitionRequestStatusAction } from "@/app/actions/requests";

type Role = "consumer" | "provider";

const PROVIDER_ACTIONS: Partial<Record<RequestStatus, RequestStatus[]>> = {
  PLACED: ["RESPONDED", "DROPPED"],
  RESPONDED: ["SCHEDULED", "DROPPED"],
  SCHEDULED: [],
  CONFIRMED: ["COMMENCED"],
  COMMENCED: ["STARTED"],
  STARTED: ["DELIVERED"],
  DELIVERED: [],
};

const CONSUMER_ACTIONS: Partial<Record<RequestStatus, RequestStatus[]>> = {
  PLACED: ["CANCELED"],
  RESPONDED: ["CANCELED"],
  SCHEDULED: ["CONFIRMED", "CANCELED"],
  DELIVERED: ["COMPLETED"],
};

const LABELS: Record<RequestStatus, string> = {
  PLACED: "Place",
  RESPONDED: "Respond",
  SCHEDULED: "Schedule",
  CONFIRMED: "Confirm",
  COMMENCED: "Start prep",
  STARTED: "Begin work",
  DELIVERED: "Mark delivered",
  COMPLETED: "Mark complete",
  DROPPED: "Drop",
  CANCELED: "Cancel",
};

export function RequestActions({
  requestId,
  status,
  role,
}: {
  requestId: string;
  status: RequestStatus;
  role: Role;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = (role === "provider" ? PROVIDER_ACTIONS : CONSUMER_ACTIONS)[status] ?? [];
  if (next.length === 0) return <span className="text-xs text-white/40">No actions</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        {next.map((s) => {
          const danger = s === "CANCELED" || s === "DROPPED";
          return (
            <button
              key={s}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await transitionRequestStatusAction(requestId, s);
                  if (!res.ok) setError(res.error);
                })
              }
              className={
                danger
                  ? "ss-btn-ghost text-xs text-rose-300 hover:text-rose-200"
                  : "ss-btn-primary text-xs"
              }
            >
              {pending && <Loader2 size={12} className="animate-spin" />}
              {LABELS[s]}
            </button>
          );
        })}
      </div>
      {error && <span className="text-xs text-rose-300">{error}</span>}
    </div>
  );
}
