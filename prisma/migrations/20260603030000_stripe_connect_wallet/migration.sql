-- Stripe Connect wallet integration
ALTER TABLE "User"
  ADD COLUMN "stripeConnectAccountId" TEXT,
  ADD COLUMN "stripeConnectOnboarded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stripeConnectPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "User_stripeConnectAccountId_key" ON "User"("stripeConnectAccountId");

ALTER TABLE "LedgerEntry"
  ADD COLUMN "stripePaymentIntentId" TEXT,
  ADD COLUMN "stripeTransferId" TEXT,
  ADD COLUMN "stripeRefundId" TEXT,
  ADD COLUMN "stripePayoutId" TEXT,
  ADD COLUMN "stripeStatus" TEXT;

CREATE UNIQUE INDEX "LedgerEntry_stripePaymentIntentId_key" ON "LedgerEntry"("stripePaymentIntentId");
CREATE UNIQUE INDEX "LedgerEntry_stripeTransferId_key" ON "LedgerEntry"("stripeTransferId");
CREATE UNIQUE INDEX "LedgerEntry_stripeRefundId_key" ON "LedgerEntry"("stripeRefundId");
CREATE UNIQUE INDEX "LedgerEntry_stripePayoutId_key" ON "LedgerEntry"("stripePayoutId");

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");
