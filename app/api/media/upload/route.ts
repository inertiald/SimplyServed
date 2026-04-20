import { NextResponse } from "next/server";
import { saveUpload } from "@/lib/storage";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Multipart upload endpoint. In production this would issue a signed URL to
 * GCS/S3, but for the docker demo we save to local disk under /public/uploads.
 *
 *   POST /api/media/upload  (multipart with 'file' field)
 */
export async function POST(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }

  try {
    const stored = await saveUpload(file);
    return NextResponse.json(stored);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
