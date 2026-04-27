"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { signUpAction, type ActionResult } from "@/app/actions/auth";

export default function SignUpPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    signUpAction,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      const next = (state.data as { next?: string } | null)?.next ?? "/dashboard";
      router.push(next);
    }
  }, [state, router]);

  const fe = (state && !state.ok && state.fieldErrors) || {};

  return (
    <div className="ss-card p-8">
      <h1 className="text-2xl font-semibold text-white">Join your neighborhood</h1>
      <p className="mt-1 text-sm text-white/60">
        One account works for both consuming and providing services.
      </p>

      <form action={action} className="mt-6 flex flex-col gap-4">
        <div>
          <label className="ss-label" htmlFor="name">Name</label>
          <input id="name" name="name" required className="ss-input" />
          {fe.name && <p className="mt-1 text-xs text-rose-300">{fe.name}</p>}
        </div>
        <div>
          <label className="ss-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="ss-input" />
          {fe.email && <p className="mt-1 text-xs text-rose-300">{fe.email}</p>}
        </div>
        <div>
          <label className="ss-label" htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="ss-input"
          />
          {fe.password && <p className="mt-1 text-xs text-rose-300">{fe.password}</p>}
        </div>
        <fieldset>
          <legend className="ss-label">I&apos;m here to…</legend>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              { v: "consumer", label: "Discover" },
              { v: "provider", label: "Provide" },
              { v: "both", label: "Both" },
            ].map((opt) => (
              <label
                key={opt.v}
                className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-white/80 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-500/20 has-[:checked]:text-white"
              >
                <input type="radio" name="intent" value={opt.v} defaultChecked={opt.v === "both"} className="hidden" />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        {state && !state.ok && !state.fieldErrors && (
          <p className="text-sm text-rose-300">{state.error}</p>
        )}

        <button type="submit" disabled={pending} className="ss-btn-primary mt-2">
          {pending && <Loader2 size={14} className="animate-spin" />}
          Create account
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/60">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-indigo-300 hover:text-indigo-200">
          Sign in
        </Link>
      </p>
    </div>
  );
}
