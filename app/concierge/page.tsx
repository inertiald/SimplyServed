import { Sparkles } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { ConciergeChat } from "@/components/ConciergeChat";

export const dynamic = "force-dynamic";

export default async function ConciergePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  const params = await searchParams;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="ss-chip mb-2">
            <Sparkles size={12} className="text-fuchsia-300" />
            Local LLM · Tool-calling
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Concierge
          </h1>
          <p className="mt-1 max-w-xl text-sm text-white/60">
            Tell our AI agent what you need. It searches active listings around
            you in real time and drafts a request you can place in one click.
          </p>
        </div>
      </div>
      <ConciergeChat
        agent="concierge"
        initialPrompt={params.q}
        signedIn={!!user}
      />
    </div>
  );
}
