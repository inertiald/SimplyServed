import crypto from "node:crypto";

/**
 * Build a privacy-preserving impression hash. Buckets by hour so the same user
 * can react fresh per hour, but cannot spam the counter mid-hour.
 */
export function impressionHash(
  userId: string,
  listingId: string,
  reaction: string,
  date = new Date(),
): string {
  const secret =
    process.env.IMPRESSION_SECRET ?? process.env.AUTH_SECRET ?? "dev-impression-secret";
  const bucket = Math.floor(date.getTime() / (1000 * 60 * 60));
  return crypto
    .createHmac("sha256", secret)
    .update(`${userId}|${listingId}|${reaction}|${bucket}`)
    .digest("hex");
}
