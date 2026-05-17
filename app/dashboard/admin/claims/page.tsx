import { prisma } from "@/lib/prisma";
import { AdminClaimRow } from "@/components/admin/AdminClaimRow";

export const dynamic = "force-dynamic";

export default async function AdminClaimsPage() {
  const claims = await prisma.businessClaim.findMany({
    where: { status: "PENDING" },
    orderBy: { submittedAt: "desc" },
    take: 50,
    include: {
      businessProfile: { select: { name: true, slug: true, website: true, phone: true } },
    },
  });

  return (
    <section className="ss-card p-5">
      <h2 className="text-base font-semibold text-white">Pending claims</h2>
      {claims.length === 0 ? (
        <p className="mt-2 text-sm text-white/50">Nothing to review.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {claims.map((c) => (
            <AdminClaimRow
              key={c.id}
              claimId={c.id}
              method={c.verificationMethod}
              submittedAt={c.submittedAt.toISOString()}
              business={{
                name: c.businessProfile.name,
                slug: c.businessProfile.slug,
                website: c.businessProfile.website,
                phone: c.businessProfile.phone,
              }}
              payload={c.verificationPayload}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
