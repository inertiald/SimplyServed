import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID ?? null;

let stripeSingleton: Stripe | null | undefined;

export function getStripeClient(): Stripe | null {
  if (stripeSingleton !== undefined) return stripeSingleton;
  if (!STRIPE_SECRET_KEY) {
    stripeSingleton = null;
    return stripeSingleton;
  }
  stripeSingleton = new Stripe(STRIPE_SECRET_KEY);
  return stripeSingleton;
}

export function isStripeEnabled(): boolean {
  return Boolean(getStripeClient());
}

export function stripeSupportsTestPaymentMethod(): boolean {
  return Boolean(STRIPE_SECRET_KEY?.startsWith("sk_test_"));
}

export function toStripeCents(amount: number): number {
  return Math.round(amount * 100);
}
