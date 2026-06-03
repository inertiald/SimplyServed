export const OFFER_EXPIRY_DATE_ONLY_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
export const OFFER_EXPIRY_ISO_PREFIX_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T";

const DATE_ONLY_RE = new RegExp(OFFER_EXPIRY_DATE_ONLY_PATTERN);
const ISO_PREFIX_RE = new RegExp(OFFER_EXPIRY_ISO_PREFIX_PATTERN);

export function getOfferExpiresAt(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;

  const offer = (metadata as { offer?: unknown }).offer;
  if (!offer || typeof offer !== "object") return null;

  const expiresAt = (offer as { expiresAt?: unknown }).expiresAt;
  return typeof expiresAt === "string" && expiresAt.trim().length > 0 ? expiresAt : null;
}

export function isOfferExpired(expiresAt: string, now = new Date()): boolean {
  const nowIso = now.toISOString();

  if (DATE_ONLY_RE.test(expiresAt)) {
    return expiresAt < nowIso.slice(0, 10);
  }

  if (ISO_PREFIX_RE.test(expiresAt)) {
    return expiresAt < nowIso;
  }

  const parsed = Date.parse(expiresAt);
  return !Number.isNaN(parsed) && parsed < now.getTime();
}

export function isOfferMetadataExpired(metadata: unknown, now = new Date()): boolean {
  const expiresAt = getOfferExpiresAt(metadata);
  return expiresAt ? isOfferExpired(expiresAt, now) : false;
}
