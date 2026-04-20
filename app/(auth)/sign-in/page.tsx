"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { signInAction, type ActionResult } from "@/app/actions/auth";

export default function SignInPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    signInAction,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) router.push("/dashboard");
  }, [state, router]);

  return (
    <div className="ss-card p-8">
      <h1 className="text-2xl font-semibold text-white">Welcome back</h1>
      <p className="mt-1 text-sm text-white/60">
        Sign in to discover your neighborhood.
      </p>

      <form action={action} className="mt-6 flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="ss-label">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="ss-input" />
        </div>
        <div>
          <label htmlFor="password" className="ss-label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="ss-input"
          />
        </div>

        {state && !state.ok && (
          <p className="text-sm text-rose-300">{state.error}</p>
        )}

        <button type="submit" disabled={pending} className="ss-btn-primary mt-2">
          {pending && <Loader2 size={14} className="animate-spin" />}
          Sign in
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/60">
        New here?{" "}
        <Link href="/sign-up" className="text-indigo-300 hover:text-indigo-200">
          Create an account
        </Link>
      </p>
    </div>
  );
}
