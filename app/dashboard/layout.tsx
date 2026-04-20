import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Hi, {user.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-white/60">Two sides of the same neighborhood.</p>
        </div>
        <nav className="flex gap-1 rounded-xl bg-white/5 p-1 text-xs">
          <Link href="/dashboard/consumer" className="rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10 hover:text-white">
            Consumer
          </Link>
          <Link href="/dashboard/provider" className="rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10 hover:text-white">
            Provider
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
