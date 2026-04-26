/**
 * Internal wallet primitives — Stripe-ready abstraction.
 *
 * The fee math (`calculateFees`) lives in `lib/payments.ts` so it can be
 * imported by client components without dragging Prisma into the client bundle.
 * This module is server-only.
 *
 * All money movements are mirrored as append-only `LedgerEntry` rows. The
 * `(requestId, kind)` unique index makes payment side-effects idempotent —
 * double-clicking "Confirm" or "Complete" can't double-charge or double-pay.
 *
 * Swapping in Stripe later: replace the bodies of `holdForRequest`,
 * `releaseToProvider`, `refundConsumer`, and `fundWallet` with PaymentIntent /
 * Transfer / Refund calls. Everything calling them stays the same.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { PLATFORM_FEE_BPS } from "@/lib/payments";

const MAX_TOPUP = 10_000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type WalletErrorCode =
  | "INSUFFICIENT_FUNDS"
  | "INVALID_AMOUNT"
  | "ALREADY_APPLIED"
  | "NOT_FOUND";

export class WalletError extends Error {
  code: WalletErrorCode;
  constructor(code: WalletErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

/** Demo top-up: credit consumer wallet. Replace with Stripe PaymentIntent. */
export async function fundWallet(userId: string, amount: number): Promise<number> {
  const amt = round2(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0 || amt > MAX_TOPUP) {
    throw new WalletError("INVALID_AMOUNT", `Amount must be between 0 and ${MAX_TOPUP}.`);
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { consumerBalance: { increment: amt } },
      select: { consumerBalance: true },
    });
    await tx.ledgerEntry.create({
      data: {
        userId,
        kind: "TOPUP",
        amount: amt,
        memo: "Wallet top-up (demo)",
      },
    });
    return updated.consumerBalance;
  });
}

/**
 * Hold the full booking total against a consumer's wallet. Idempotent per
 * `(requestId, HOLD)` — calling twice is a no-op rather than a double charge.
 * Throws `WalletError("INSUFFICIENT_FUNDS")` if the consumer can't afford it.
 */
export async function holdForRequest(params: {
  requestId: string;
  consumerId: string;
  total: number;
}): Promise<void> {
  const total = round2(params.total);
  if (!(total > 0)) throw new WalletError("INVALID_AMOUNT");

  await prisma.$transaction(async (tx) => {
    const existing = await tx.ledgerEntry.findUnique({
      where: { requestId_kind: { requestId: params.requestId, kind: "HOLD" } },
    });
    if (existing) return; // idempotent

    const consumer = await tx.user.findUnique({
      where: { id: params.consumerId },
      select: { consumerBalance: true },
    });
    if (!consumer) throw new WalletError("NOT_FOUND");
    if (consumer.consumerBalance < total) {
      throw new WalletError(
        "INSUFFICIENT_FUNDS",
        `Need $${total.toFixed(2)} to confirm; wallet has $${consumer.consumerBalance.toFixed(2)}.`,
      );
    }

    await tx.user.update({
      where: { id: params.consumerId },
      data: { consumerBalance: { decrement: total } },
    });
    await tx.ledgerEntry.create({
      data: {
        userId: params.consumerId,
        requestId: params.requestId,
        kind: "HOLD",
        amount: -total,
        memo: "Held in escrow on confirm",
      },
    });
  });
}

/**
 * Release a previously-held request to the provider, taking the platform fee.
 * Provider receives `base` (their hourly_rate × hours). The platform fee is
 * recorded against the consumer side of the ledger as bookkeeping.
 */
export async function releaseToProvider(params: {
  requestId: string;
  consumerId: string;
  providerId: string;
  base: number;
  platformFee: number;
}): Promise<void> {
  const base = round2(params.base);
  const fee = round2(params.platformFee);

  await prisma.$transaction(async (tx) => {
    const hold = await tx.ledgerEntry.findUnique({
      where: { requestId_kind: { requestId: params.requestId, kind: "HOLD" } },
    });
    if (!hold) return; // nothing held; nothing to release
    const existing = await tx.ledgerEntry.findUnique({
      where: { requestId_kind: { requestId: params.requestId, kind: "RELEASE" } },
    });
    if (existing) return; // idempotent

    await tx.user.update({
      where: { id: params.providerId },
      data: { providerBalance: { increment: base } },
    });
    await tx.ledgerEntry.create({
      data: {
        userId: params.providerId,
        requestId: params.requestId,
        kind: "RELEASE",
        amount: base,
        memo: "Service completed — payout from escrow",
      },
    });
    if (fee > 0) {
      await tx.ledgerEntry.create({
        data: {
          userId: params.consumerId,
          requestId: params.requestId,
          kind: "FEE",
          amount: -fee,
          memo: `Platform fee (${PLATFORM_FEE_BPS / 100}%)`,
        },
      });
    }
  });
}

/**
 * Refund the held amount back to the consumer. Used when a CONFIRMED (or later,
 * but pre-COMPLETED) request is canceled/dropped.
 */
export async function refundConsumer(params: {
  requestId: string;
  consumerId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const hold = await tx.ledgerEntry.findUnique({
      where: { requestId_kind: { requestId: params.requestId, kind: "HOLD" } },
    });
    if (!hold) return; // nothing was held; nothing to refund
    const released = await tx.ledgerEntry.findUnique({
      where: { requestId_kind: { requestId: params.requestId, kind: "RELEASE" } },
    });
    if (released) return; // already paid out, can't refund
    const existing = await tx.ledgerEntry.findUnique({
      where: { requestId_kind: { requestId: params.requestId, kind: "REFUND" } },
    });
    if (existing) return; // idempotent

    const refundAmount = -hold.amount; // hold was negative; refund positive
    await tx.user.update({
      where: { id: params.consumerId },
      data: { consumerBalance: { increment: refundAmount } },
    });
    await tx.ledgerEntry.create({
      data: {
        userId: params.consumerId,
        requestId: params.requestId,
        kind: "REFUND",
        amount: refundAmount,
        memo: "Refund — request canceled",
      },
    });
  });
}

export interface WalletSummary {
  consumerBalance: number;
  providerBalance: number;
  recent: Array<{
    id: string;
    kind: string;
    amount: number;
    memo: string | null;
    createdAt: Date;
    requestId: string | null;
  }>;
}

export async function getWalletSummary(userId: string, take = 8): Promise<WalletSummary> {
  const [user, recent] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { consumerBalance: true, providerBalance: true },
    }),
    prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        kind: true,
        amount: true,
        memo: true,
        createdAt: true,
        requestId: true,
      },
    }),
  ]);
  return {
    consumerBalance: user?.consumerBalance ?? 0,
    providerBalance: user?.providerBalance ?? 0,
    recent,
  };
}
