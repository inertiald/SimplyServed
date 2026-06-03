import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function reconcilePaymentIntent(event: Stripe.Event) {
  const intent = event.data.object as Stripe.PaymentIntent;
  const userId = intent.metadata?.userId;
  const purpose = intent.metadata?.purpose;
  if (purpose !== "wallet_topup" || !userId) return;

  const amount = round2((intent.amount_received ?? intent.amount) / 100);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.ledgerEntry.findUnique({
      where: { stripePaymentIntentId: intent.id },
      select: { id: true },
    });
    if (existing) {
      await tx.ledgerEntry.update({
        where: { id: existing.id },
        data: { stripeStatus: intent.status },
      });
      return;
    }

    await tx.user.update({
      where: { id: userId },
      data: { consumerBalance: { increment: amount } },
    });
    await tx.ledgerEntry.create({
      data: {
        userId,
        kind: "TOPUP",
        amount,
        memo: "Wallet top-up (Stripe webhook)",
        stripePaymentIntentId: intent.id,
        stripeStatus: intent.status,
      },
    });
  });
}

async function reconcileAccountUpdated(event: Stripe.Event) {
  const account = event.data.object as Stripe.Account;
  await prisma.user.updateMany({
    where: { stripeConnectAccountId: account.id },
    data: {
      stripeConnectOnboarded: Boolean(account.details_submitted),
      stripeConnectPayoutsEnabled: Boolean(account.payouts_enabled),
    },
  });
}

async function reconcileTransfer(event: Stripe.Event) {
  const transfer = event.data.object as Stripe.Transfer;
  const requestId = transfer.metadata?.requestId;
  if (!requestId) return;

  const updated = await prisma.ledgerEntry.updateMany({
    where: { requestId, kind: "RELEASE" },
    data: {
      stripeTransferId: transfer.id,
      stripeStatus: "created",
    },
  });
  if (updated.count === 0) {
    console.warn("[stripe-webhook] release ledger not found for transfer", {
      requestId,
      transferId: transfer.id,
    });
  }
}

async function reconcilePayout(event: Stripe.Event) {
  const payout = event.data.object as Stripe.Payout;
  const requestId = payout.metadata?.requestId;
  if (!requestId) return;

  const statusByEvent: Record<string, string> = {
    "payout.created": "created",
    "payout.paid": "paid",
    "payout.failed": "failed",
    "payout.canceled": "canceled",
    "payout.updated": payout.status,
    "payout.reconciliation_completed": "reconciled",
  };

  const updated = await prisma.ledgerEntry.updateMany({
    where: { requestId, kind: "RELEASE" },
    data: {
      stripePayoutId: payout.id,
      stripeStatus: statusByEvent[event.type] ?? payout.status,
    },
  });
  if (updated.count === 0) {
    console.warn("[stripe-webhook] release ledger not found for payout", {
      requestId,
      payoutId: payout.id,
      eventType: event.type,
    });
  }
}

async function processEvent(event: Stripe.Event) {
  switch (event.type) {
    case "payment_intent.succeeded":
      await reconcilePaymentIntent(event);
      return;
    case "account.updated":
      await reconcileAccountUpdated(event);
      return;
    case "transfer.created":
      await reconcileTransfer(event);
      return;
    case "payout.created":
    case "payout.updated":
    case "payout.paid":
    case "payout.failed":
    case "payout.canceled":
    case "payout.reconciliation_completed":
      await reconcilePayout(event);
      return;
    default:
      return;
  }
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: true, skipped: true, reason: "stripe_not_configured" });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing Stripe signature header." }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Invalid Stripe signature: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { eventId: event.id },
    select: { id: true, processedAt: true },
  });
  if (existing?.processedAt) {
    return NextResponse.json({ ok: true, duplicate: true, eventId: event.id });
  }
  if (!existing) {
    await prisma.stripeWebhookEvent.create({
      data: { eventId: event.id, type: event.type },
    });
  }

  try {
    await processEvent(event);
    await prisma.stripeWebhookEvent.update({
      where: { eventId: event.id },
      data: { processedAt: new Date(), type: event.type },
    });
    return NextResponse.json({ ok: true, eventId: event.id });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Webhook processing failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
