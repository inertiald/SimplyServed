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
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { PLATFORM_FEE_BPS } from "@/lib/payments";
import {
  getStripeClient,
  STRIPE_CONNECT_CLIENT_ID,
  isStripeEnabled,
  stripeSupportsTestPaymentMethod,
  toStripeCents,
} from "@/lib/stripe";

const MAX_TOPUP = 10_000;
const CURRENCY = "usd";

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

function walletErrorFromStripe(err: unknown, fallback = "Payments are temporarily unavailable.") {
  if (err instanceof WalletError) return err;
  if (isStripeCardError(err)) {
    if (err.code === "insufficient_funds") {
      return new WalletError("INSUFFICIENT_FUNDS", "The payment method has insufficient funds.");
    }
    return new WalletError("INVALID_AMOUNT", err.message || fallback);
  }
  if (isStripeInvalidRequestError(err)) {
    return new WalletError("INVALID_AMOUNT", err.message || fallback);
  }
  const message = err instanceof Error ? err.message : fallback;
  return new WalletError("NOT_FOUND", message || fallback);
}

function isStripeCardError(err: unknown): err is { type: string; code?: string; message?: string } {
  return Boolean(
    err &&
      typeof err === "object" &&
      "type" in err &&
      (err as { type: string }).type === "StripeCardError",
  );
}

function isStripeInvalidRequestError(err: unknown): err is { type: string; message?: string } {
  return Boolean(
    err &&
      typeof err === "object" &&
      "type" in err &&
      (err as { type: string }).type === "StripeInvalidRequestError",
  );
}

export interface ProviderOnboardingLink {
  accountId: string;
  url: string;
  expiresAt: Date | null;
  clientId: string | null;
}

async function ensureProviderStripeAccount(userId: string): Promise<string> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new WalletError(
      "NOT_FOUND",
      "Stripe is not configured. Set STRIPE_SECRET_KEY to enable provider onboarding.",
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      stripeConnectAccountId: true,
    },
  });
  if (!user) throw new WalletError("NOT_FOUND", "Provider account was not found.");
  if (user.stripeConnectAccountId) return user.stripeConnectAccountId;

  try {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: user.email,
      business_type: "individual",
      metadata: { userId: user.id, userName: user.name },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { stripeConnectAccountId: account.id },
    });
    return account.id;
  } catch (err) {
    throw walletErrorFromStripe(err, "Failed to create Stripe Connect account.");
  }
}

export async function createProviderOnboardingLink(params: {
  userId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<ProviderOnboardingLink> {
  if (!isStripeEnabled()) {
    const accountId = `acct_dev_${params.userId.replace(/-/g, "").slice(0, 12)}`;
    await prisma.user.update({
      where: { id: params.userId },
      data: {
        stripeConnectAccountId: accountId,
        stripeConnectOnboarded: true,
        stripeConnectPayoutsEnabled: true,
      },
    });
    const url = `${params.returnUrl}${params.returnUrl.includes("?") ? "&" : "?"}stripe=stub`;
    return { accountId, url, expiresAt: null, clientId: STRIPE_CONNECT_CLIENT_ID };
  }

  const stripe = getStripeClient();
  if (!stripe) throw new WalletError("NOT_FOUND", "Stripe is not configured.");

  const accountId = await ensureProviderStripeAccount(params.userId);

  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: "account_onboarding",
    });

    return {
      accountId,
      url: link.url,
      expiresAt: link.expires_at ? new Date(link.expires_at * 1000) : null,
      clientId: STRIPE_CONNECT_CLIENT_ID,
    };
  } catch (err) {
    throw walletErrorFromStripe(err, "Failed to create Stripe onboarding link.");
  }
}

async function applyTopupLedger(userId: string, amount: number, paymentIntentId?: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    if (paymentIntentId) {
      const existing = await tx.ledgerEntry.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        select: { id: true },
      });
      if (existing) {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { consumerBalance: true },
        });
        return user?.consumerBalance ?? 0;
      }
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { consumerBalance: { increment: amount } },
      select: { consumerBalance: true },
    });
    await tx.ledgerEntry.create({
      data: {
        userId,
        kind: "TOPUP",
        amount,
        memo: paymentIntentId ? "Wallet top-up (Stripe)" : "Wallet top-up (demo)",
        stripePaymentIntentId: paymentIntentId,
        stripeStatus: paymentIntentId ? "succeeded" : null,
      },
    });
    return updated.consumerBalance;
  });
}

/** Demo top-up: credit consumer wallet. Replace with Stripe PaymentIntent. */
export async function fundWallet(userId: string, amount: number): Promise<number> {
  const amt = round2(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0 || amt > MAX_TOPUP) {
    throw new WalletError("INVALID_AMOUNT", `Amount must be between 0 and ${MAX_TOPUP}.`);
  }

  if (!isStripeEnabled()) {
    return applyTopupLedger(userId, amt);
  }

  const stripe = getStripeClient();
  if (!stripe) throw new WalletError("NOT_FOUND", "Stripe is not configured.");

  try {
    const allowTestAutoconfirm = stripeSupportsTestPaymentMethod();
    const topupRequestId = randomUUID();
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: toStripeCents(amt),
        currency: CURRENCY,
        confirm: allowTestAutoconfirm,
        capture_method: "automatic",
        payment_method: allowTestAutoconfirm ? "pm_card_visa" : undefined,
        automatic_payment_methods: allowTestAutoconfirm ? undefined : { enabled: true },
        metadata: { purpose: "wallet_topup", userId, topupRequestId },
      },
      { idempotencyKey: `topup:${topupRequestId}` },
    );

    if (paymentIntent.status !== "succeeded") {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { consumerBalance: true },
      });
      return user?.consumerBalance ?? 0;
    }

    return applyTopupLedger(userId, amt, paymentIntent.id);
  } catch (err) {
    throw walletErrorFromStripe(err, "Failed to process top-up with Stripe.");
  }
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

  const existing = await prisma.ledgerEntry.findUnique({
    where: { requestId_kind: { requestId: params.requestId, kind: "HOLD" } },
  });
  if (existing) return;

  const consumer = await prisma.user.findUnique({
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

  let paymentIntentId: string | undefined;
  if (isStripeEnabled()) {
    const stripe = getStripeClient();
    if (!stripe) throw new WalletError("NOT_FOUND", "Stripe is not configured.");
    try {
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: toStripeCents(total),
          currency: CURRENCY,
          capture_method: "manual",
          confirm: stripeSupportsTestPaymentMethod(),
          payment_method: stripeSupportsTestPaymentMethod() ? "pm_card_visa" : undefined,
          automatic_payment_methods: stripeSupportsTestPaymentMethod() ? undefined : { enabled: true },
          metadata: {
            purpose: "request_hold",
            requestId: params.requestId,
            consumerId: params.consumerId,
          },
        },
        { idempotencyKey: `hold:${params.requestId}` },
      );
      paymentIntentId = paymentIntent.id;
    } catch (err) {
      throw walletErrorFromStripe(err, "Failed to place Stripe hold for this request.");
    }
  }

  await prisma.$transaction(async (tx) => {
    const again = await tx.ledgerEntry.findUnique({
      where: { requestId_kind: { requestId: params.requestId, kind: "HOLD" } },
    });
    if (again) return;

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
        memo: paymentIntentId ? "Held in escrow on confirm (Stripe)" : "Held in escrow on confirm",
        stripePaymentIntentId: paymentIntentId,
        stripeStatus: paymentIntentId ? "requires_capture" : null,
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

  const hold = await prisma.ledgerEntry.findUnique({
    where: { requestId_kind: { requestId: params.requestId, kind: "HOLD" } },
  });
  if (!hold) return;

  const existing = await prisma.ledgerEntry.findUnique({
    where: { requestId_kind: { requestId: params.requestId, kind: "RELEASE" } },
  });
  if (existing) return;

  let stripeTransferId: string | undefined;
  let stripePayoutId: string | undefined;

  if (isStripeEnabled()) {
    const stripe = getStripeClient();
    if (!stripe) throw new WalletError("NOT_FOUND", "Stripe is not configured.");

    const provider = await prisma.user.findUnique({
      where: { id: params.providerId },
      select: { stripeConnectAccountId: true },
    });
    if (!provider?.stripeConnectAccountId) {
      throw new WalletError(
        "NOT_FOUND",
        "Provider does not have a connected Stripe account yet. Complete provider onboarding first.",
      );
    }

    try {
      if (hold.stripePaymentIntentId) {
        await stripe.paymentIntents.capture(hold.stripePaymentIntentId, undefined, {
          idempotencyKey: `capture:${params.requestId}`,
        });
      }

      const transfer = await stripe.transfers.create(
        {
          amount: toStripeCents(base),
          currency: CURRENCY,
          destination: provider.stripeConnectAccountId,
          transfer_group: `request_${params.requestId}`,
          metadata: {
            requestId: params.requestId,
            consumerId: params.consumerId,
            providerId: params.providerId,
          },
        },
        { idempotencyKey: `transfer:${params.requestId}` },
      );
      stripeTransferId = transfer.id;

      try {
        const payout = await stripe.payouts.create(
          {
            amount: toStripeCents(base),
            currency: CURRENCY,
            metadata: { requestId: params.requestId, providerId: params.providerId },
          },
          {
            stripeAccount: provider.stripeConnectAccountId,
            idempotencyKey: `payout:${params.requestId}`,
          },
        );
        stripePayoutId = payout.id;
      } catch (payoutErr) {
        console.warn("[wallet] Stripe payout could not be triggered immediately", {
          requestId: params.requestId,
          providerId: params.providerId,
          error: payoutErr instanceof Error ? payoutErr.message : payoutErr,
        });
      }
    } catch (err) {
      throw walletErrorFromStripe(err, "Failed to release escrow to provider in Stripe.");
    }
  }

  await prisma.$transaction(async (tx) => {
    const alreadyReleased = await tx.ledgerEntry.findUnique({
      where: { requestId_kind: { requestId: params.requestId, kind: "RELEASE" } },
    });
    if (alreadyReleased) return;

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
        stripeTransferId,
        stripePayoutId,
        stripeStatus: stripeTransferId ? "paid" : null,
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
  const hold = await prisma.ledgerEntry.findUnique({
    where: { requestId_kind: { requestId: params.requestId, kind: "HOLD" } },
  });
  if (!hold) return;

  const released = await prisma.ledgerEntry.findUnique({
    where: { requestId_kind: { requestId: params.requestId, kind: "RELEASE" } },
  });
  if (released) return;

  const existing = await prisma.ledgerEntry.findUnique({
    where: { requestId_kind: { requestId: params.requestId, kind: "REFUND" } },
  });
  if (existing) return;

  let stripeRefundId: string | undefined;
  if (isStripeEnabled() && hold.stripePaymentIntentId) {
    const stripe = getStripeClient();
    if (!stripe) throw new WalletError("NOT_FOUND", "Stripe is not configured.");

    try {
      const intent = await stripe.paymentIntents.retrieve(hold.stripePaymentIntentId);
      if (intent.status === "requires_capture") {
        const canceled = await stripe.paymentIntents.cancel(hold.stripePaymentIntentId, undefined, {
          idempotencyKey: `cancel:${params.requestId}`,
        });
        stripeRefundId = canceled.id;
      } else if (intent.status === "succeeded") {
        const refund = await stripe.refunds.create(
          {
            payment_intent: hold.stripePaymentIntentId,
            metadata: { requestId: params.requestId, consumerId: params.consumerId },
          },
          { idempotencyKey: `refund:${params.requestId}` },
        );
        stripeRefundId = refund.id;
      }
    } catch (err) {
      throw walletErrorFromStripe(err, "Failed to refund this request in Stripe.");
    }
  }

  await prisma.$transaction(async (tx) => {
    const alreadyRefunded = await tx.ledgerEntry.findUnique({
      where: { requestId_kind: { requestId: params.requestId, kind: "REFUND" } },
    });
    if (alreadyRefunded) return;

    const refundAmount = -hold.amount;
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
        stripeRefundId,
        stripeStatus: stripeRefundId ? "refunded" : null,
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
