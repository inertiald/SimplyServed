import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";

/**
 * Storage abstraction. Defaults to local-disk uploads (perfect for the docker
 * demo + dev) and is easy to swap for GCS / S3 / R2 in production by re-binding
 * the implementation behind the same interface.
 */
export interface StoredFile {
  url: string;
  key: string;
  contentType: string;
  size: number;
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function saveUpload(file: File): Promise<StoredFile> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (max ${MAX_BYTES / (1024 * 1024)} MB)`);
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const ext = mimeToExt(file.type);
  const key = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const target = path.join(UPLOAD_DIR, key);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(target, buf);

  return {
    url: `/uploads/${key}`,
    key,
    contentType: file.type,
    size: file.size,
  };
}

function mimeToExt(mime: string): string {
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
