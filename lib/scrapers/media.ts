/**
 * Media ingestion for scraped business profiles.
 *
 * Pipeline:
 *   1. HEAD the URL to verify content-type + size cap (no point downloading
 *      a 500MB video to find out we don't want it).
 *   2. Stream the body to local storage via the same pluggable path as user
 *      uploads (`public/uploads/...`). Production deployments can swap this
 *      for S3/GCS by re-binding `lib/storage.ts`.
 *   3. Compute a perceptual-ish hash so the unique `(profileId, phash)`
 *      index in Prisma blocks dupes on re-scrapes.
 *
 * For pHash we use a SHA-256 over a normalized byte sample — it's content-
 * hashing, not true perceptual hashing, but it correctly catches identical
 * downloads (the most common dupe case) without a native dependency.
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { politeFetch } from "./http";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "businesses");

export interface IngestedMedia {
  url: string;
  contentType: string;
  size: number;
  phash: string;
  width?: number;
  height?: number;
}

export interface IngestMediaOptions {
  kind: "IMAGE" | "VIDEO";
  /** Skip the network HEAD/GET — used in tests. */
  fakeBody?: Buffer;
  fakeMime?: string;
}

function extFor(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    default:
      return "";
  }
}

export async function ingestMedia(
  originUrl: string,
  opts: IngestMediaOptions,
): Promise<IngestedMedia> {
  const allowed = opts.kind === "IMAGE" ? ALLOWED_IMAGE_MIMES : ALLOWED_VIDEO_MIMES;
  const maxBytes = opts.kind === "IMAGE" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

  let buf: Buffer;
  let contentType: string;

  if (opts.fakeBody) {
    buf = opts.fakeBody;
    contentType = opts.fakeMime ?? "image/jpeg";
  } else {
    // HEAD to gate by size + type before pulling bytes.
    let head: Response | null = null;
    try {
      head = await politeFetch(originUrl, { method: "HEAD" });
    } catch {
      // Some CDNs reject HEAD — fall through to GET with manual size enforcement.
    }
    if (head) {
      const ct = head.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      const len = Number(head.headers.get("content-length") ?? "0");
      if (ct && !allowed.has(ct)) throw new Error(`media: unsupported mime ${ct}`);
      if (len && len > maxBytes) throw new Error(`media: too large (${len} bytes)`);
    }
    const res = await politeFetch(originUrl);
    if (!res.ok) throw new Error(`media: HTTP ${res.status}`);
    contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!allowed.has(contentType)) {
      throw new Error(`media: unsupported mime ${contentType}`);
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error(`media: too large (${ab.byteLength} bytes)`);
    buf = Buffer.from(ab);
  }

  if (!allowed.has(contentType)) {
    throw new Error(`media: unsupported mime ${contentType}`);
  }

  const phash = crypto.createHash("sha256").update(buf).digest("hex");

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const key = `${phash.slice(0, 16)}${extFor(contentType)}`;
  const target = path.join(UPLOAD_DIR, key);
  // If we've already written this exact file, don't bother re-writing.
  try {
    await fs.access(target);
  } catch {
    await fs.writeFile(target, buf);
  }

  return {
    url: `/uploads/businesses/${key}`,
    contentType,
    size: buf.byteLength,
    phash,
  };
}
