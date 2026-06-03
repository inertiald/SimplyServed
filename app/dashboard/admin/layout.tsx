import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "ADMINISTRATOR") redirect("/dashboard");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Admin</h1>
        <p className="text-sm text-white/60">
          Scraping, claims, and merge review — visible to administrators only.
        </p>
      </div>
      <nav className="flex gap-1 rounded-xl bg-white/5 p-1 text-xs">
        <a href="/dashboard/admin/scraping" className="rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10 hover:text-white">
          Scraping
        </a>
        <a href="/dashboard/admin/claims" className="rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10 hover:text-white">
          Claims
        </a>
        <a href="/dashboard/admin/merges" className="rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10 hover:text-white">
          Merges
        </a>
      </nav>
      {children}
    </div>
  );
}
