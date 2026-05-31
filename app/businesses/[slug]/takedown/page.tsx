import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TakedownForm } from "@/components/TakedownForm";

export const dynamic = "force-dynamic";

export default async function TakedownPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await prisma.businessProfile.findUnique({
    where: { slug },
    select: { id: true, name: true, tombstonedAt: true },
  });
  if (!profile) notFound();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Remove this listing</h1>
        <p className="text-sm text-white/60">
          Request removal of <span className="text-white">{profile.name}</span> from SimplyServed.
          We&apos;ll tombstone it so future scrape runs skip it.
        </p>
      </div>
      {profile.tombstonedAt ? (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">
          This profile has already been tombstoned.
        </p>
      ) : (
        <TakedownForm profileId={profile.id} />
      )}
    </div>
  );
}
