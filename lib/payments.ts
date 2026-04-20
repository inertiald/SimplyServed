/**
 * Pluggable platform-fee + payout calculator. Wire to Stripe Connect by
 * implementing this interface elsewhere; the rest of the app stays the same.
 */
export interface FeeBreakdown {
  base: number;
  platformFee: number;
  total: number;
  currency: string;
  platformFeeBps: number;
}

const PLATFORM_FEE_BPS = 750; // 7.5%

export function calculateFees(
  hourlyRate: number,
  hours: number,
  currency = "USD",
): FeeBreakdown {
  const base = round2(hourlyRate * Math.max(hours, 1));
  const platformFee = round2((base * PLATFORM_FEE_BPS) / 10_000);
  return {
    base,
    platformFee,
    total: round2(base + platformFee),
    currency,
    platformFeeBps: PLATFORM_FEE_BPS,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
