import Link from "next/link";
import { Sparkles } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import type { SessionUser } from "@/lib/auth";
import { NotificationsBell } from "@/components/NotificationsBell";

export function Header({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-black/40 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-white">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
            <Sparkles size={16} className="text-white" />
          </span>
          <span className="text-base font-semibold tracking-tight">SimplyServed</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm text-white/70 md:flex">
          <Link
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-fuchsia-200 hover:bg-white/5"
            href="/concierge"
          >
            <Sparkles size={12} className="text-fuchsia-300" />
            Concierge
          </Link>
          <Link className="rounded-lg px-3 py-1.5 hover:bg-white/5 hover:text-white" href="/vibe">
            Vibe
          </Link>
          <Link className="rounded-lg px-3 py-1.5 hover:bg-white/5 hover:text-white" href="/listings">
            Discover
          </Link>
          {user && (
            <Link
              className="rounded-lg px-3 py-1.5 hover:bg-white/5 hover:text-white"
              href="/dashboard"
            >
              Dashboard
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <NotificationsBell />
              <span className="hidden text-sm text-white/70 sm:inline">{user.name}</span>
              <form action={signOutAction}>
                <button className="ss-btn-ghost text-xs">Sign out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="ss-btn-ghost text-xs">
                Sign in
              </Link>
              <Link href="/sign-up" className="ss-btn-primary text-xs">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
