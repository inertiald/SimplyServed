import { Sparkles } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { OnboardingAgent } from "@/components/OnboardingAgent";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="ss-chip mb-2">
            <Sparkles size={12} className="text-fuchsia-300" />
            Real-time onboarding · WebSocket
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Provider onboarding
          </h1>
          <p className="mt-1 max-w-xl text-sm text-white/60">
            Stream a guided setup: business basics, category, location, claim hand-off,
            and your first listing draft.
          </p>
        </div>
      </div>
      <OnboardingAgent
        signedIn={Boolean(user)}
        wsUrl={process.env.ONBOARDING_WS_URL}
      />
    </div>
  );
}
