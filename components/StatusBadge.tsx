import type { RequestStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const STYLES: Record<RequestStatus, string> = {
  PLACED: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  RESPONDED: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  SCHEDULED: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  CONFIRMED: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  COMMENCED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  STARTED: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  DELIVERED: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  COMPLETED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  DROPPED: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  CANCELED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        STYLES[status],
      )}
    >
      {status.toLowerCase()}
    </span>
  );
}
