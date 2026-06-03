import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ClaimWizard } from "@/components/ClaimWizard";

export const dynamic = "force-dynamic";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=/businesses/${slug}/claim`);

  const profile = await prisma.businessProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      website: true,
      phone: true,
      claimStatus: true,
      tombstonedAt: true,
    },
  });
  if (!profile || profile.tombstonedAt) notFound();
  if (profile.claimStatus === "CLAIMED") redirect(`/businesses/${slug}`);

  const hasEmailDomain = (() => {
    if (!profile.website) return false;
    try {
      const host = new URL(profile.website).hostname.replace(/^www\./, "");
      return user.email.toLowerCase().endsWith(`@${host.toLowerCase()}`);
    } catch {
      return false;
    }
  })();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Claim {profile.name}</h1>
        <p className="text-sm text-white/60">
          Verify your relationship with this business and we&apos;ll mint a real
          listing you control.
        </p>
      </div>

      <ClaimWizard
        profileId={profile.id}
        profileSlug={profile.slug}
        hasWebsite={Boolean(profile.website)}
        hasPhone={Boolean(profile.phone)}
        userEmailMatchesDomain={hasEmailDomain}
      />
    </div>
  );
}
