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

export interface StorageDriver {
  saveUpload(file: File): Promise<StoredFile>;
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

interface ValidatedUpload {
  body: Buffer;
  contentType: string;
  size: number;
}

interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
}

export class LocalDiskDriver implements StorageDriver {
  async saveUpload(file: File): Promise<StoredFile> {
    const validated = await readValidatedUpload(file);

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const key = buildObjectKey(validated.contentType);
    const target = path.join(UPLOAD_DIR, key);
    await fs.writeFile(target, validated.body);

    return {
      url: `/uploads/${key}`,
      key,
      contentType: validated.contentType,
      size: validated.size,
    };
  }
}

export class S3StorageDriver implements StorageDriver {
  constructor(private readonly config: S3Config) {}

  async saveUpload(file: File): Promise<StoredFile> {
    const validated = await readValidatedUpload(file);
    const key = buildObjectKey(validated.contentType);
    const objectUrl = this.buildObjectUrl(key);

    await putObjectSigV4({
      url: objectUrl,
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      body: validated.body,
      contentType: validated.contentType,
    });

    return {
      url: this.buildPublicUrl(key),
      key,
      contentType: validated.contentType,
      size: validated.size,
    };
  }

  private buildObjectUrl(key: string): URL {
    const encodedKey = encodeURIComponent(key);
    if (this.config.endpoint) {
      const endpoint = new URL(this.config.endpoint);
      const basePath = endpoint.pathname.replace(/\/$/, "");
      endpoint.pathname = `${basePath}/${this.config.bucket}/${encodedKey}`;
      endpoint.search = "";
      return endpoint;
    }

    return new URL(
      `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${encodedKey}`,
    );
  }

  private buildPublicUrl(key: string): string {
    if (this.config.publicBaseUrl) {
      return `${this.config.publicBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(key)}`;
    }
    return this.buildObjectUrl(key).toString();
  }
}

let storageSingleton: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (storageSingleton) {
    return storageSingleton;
  }

  const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  if (driver === "local") {
    storageSingleton = new LocalDiskDriver();
    return storageSingleton;
  }

  if (driver === "s3") {
    storageSingleton = new S3StorageDriver(loadS3Config());
    return storageSingleton;
  }

  throw new Error(`Unsupported storage driver: ${driver}`);
}

export async function saveUpload(file: File): Promise<StoredFile> {
  return getStorage().saveUpload(file);
}

async function readValidatedUpload(file: File): Promise<ValidatedUpload> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (max ${MAX_BYTES / (1024 * 1024)} MB)`);
  }

  return {
    body: Buffer.from(await file.arrayBuffer()),
    contentType: file.type,
    size: file.size,
  };
}

function buildObjectKey(contentType: string): string {
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${mimeToExt(contentType)}`;
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

function loadS3Config(): S3Config {
  return {
    bucket: requiredEnv("S3_BUCKET"),
    region: requiredEnv("S3_REGION"),
    endpoint: optionalEnv("S3_ENDPOINT"),
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    publicBaseUrl: optionalEnv("S3_PUBLIC_BASE_URL"),
  };
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requiredEnv(name: string): string {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(`Missing required env var for S3 storage: ${name}`);
  }
  return value;
}

interface SignedPutObjectParams {
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  body: Buffer;
  contentType: string;
}

async function putObjectSigV4(params: SignedPutObjectParams): Promise<void> {
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(params.body);
  const canonicalHeaders = [
    `content-type:${params.contentType}`,
    `host:${params.url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join("\n");
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    canonicalUri(params.url),
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${params.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(
    params.secretAccessKey,
    dateStamp,
    params.region,
    "s3",
  );
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${scope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const res = await fetch(params.url, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": params.contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body: params.body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`S3 upload failed (${res.status}): ${text || res.statusText}`);
  }
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function getSignatureKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function canonicalUri(url: URL): string {
  return url.pathname
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join("/");
}
