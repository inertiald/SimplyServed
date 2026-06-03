import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ss-card flex flex-col items-center gap-3 p-10 text-center", className)}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-white/60">
        <Icon size={20} />
      </span>
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-white/50">{description}</p>
      </div>
      {action}
    </div>
  );
}
