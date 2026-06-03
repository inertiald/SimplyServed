import { PostStatus, PostType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  OFFER_EXPIRY_DATE_ONLY_PATTERN,
  OFFER_EXPIRY_ISO_PREFIX_PATTERN,
} from "@/lib/offers";

async function expireActiveOffers(now = new Date()): Promise<number> {
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);

  return prisma.$transaction(async (tx) => {
    const count = await tx.$executeRaw`
      UPDATE "Post"
      SET "status" = ${PostStatus.EXPIRED}, "updatedAt" = NOW()
      WHERE "postType" = ${PostType.OFFER}
        AND "status" = ${PostStatus.ACTIVE}
        AND "metadata" IS NOT NULL
        AND jsonb_typeof("metadata") = 'object'
        AND jsonb_typeof("metadata"->'offer') = 'object'
        AND ("metadata"->'offer'->>'expiresAt') IS NOT NULL
        AND (
          (("metadata"->'offer'->>'expiresAt') ~ ${OFFER_EXPIRY_DATE_ONLY_PATTERN} AND ("metadata"->'offer'->>'expiresAt') < ${today})
          OR
          (("metadata"->'offer'->>'expiresAt') ~ ${OFFER_EXPIRY_ISO_PREFIX_PATTERN} AND ("metadata"->'offer'->>'expiresAt') < ${nowIso})
        )
    `;

    return Number(count) || 0;
  });
}

async function main() {
  try {
    const expired = await expireActiveOffers();
    console.log(`[expire:offers] Expired ${expired} offer post(s).`);
  } catch (err) {
    console.warn("[expire:offers] Tick failed; leaving posts untouched this run.", err);
  } finally {
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.warn("[expire:offers] Failed to disconnect Prisma cleanly.", err);
    }
  }
}

void main();
