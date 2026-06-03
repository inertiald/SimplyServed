import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ListingCard } from "@/components/ListingCard";
import { EmptyState } from "@/components/EmptyState";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;

  const where = {
    status: "ACTIVE" as const,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(category ? { category } : {}),
  };

  const listings = await prisma.listing.findMany({
    where,
    orderBy: [{ ratingAvg: "desc" }, { createdAt: "desc" }],
    take: 60,
    include: {
      provider: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { impressions: true, requests: true } },
    },
  });

  const categories = await prisma.listing.groupBy({
    by: ["category"],
    _count: true,
    where: { status: "ACTIVE" },
    orderBy: { _count: { category: "desc" } },
    take: 12,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Discover</h1>
        <p className="text-sm text-white/60">Trusted services in your area.</p>
      </div>

      <form className="flex flex-wrap items-center gap-2" method="get">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-3 text-white/40" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search services…"
            className="ss-input pl-9"
          />
        </div>
        <button className="ss-btn-primary" type="submit">Search</button>
      </form>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        <Link
          href="/listings"
          className={`ss-chip whitespace-nowrap ${!category ? "border-indigo-400 bg-indigo-500/20 text-white" : ""}`}
        >
          All
        </Link>
        {categories.map((c) => (
          <Link
            key={c.category}
            href={`/listings?category=${encodeURIComponent(c.category)}`}
            className={`ss-chip whitespace-nowrap ${category === c.category ? "border-indigo-400 bg-indigo-500/20 text-white" : ""}`}
          >
            {c.category}
          </Link>
        ))}
      </div>

      {listings.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matches yet"
          description="Try another search or check back as more local providers come online."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}
