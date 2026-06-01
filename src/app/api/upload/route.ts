import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { uploadToR2 } from "@/lib/r2";

// POST /api/upload  — multipart form with a "file" field and optional "prefix".
// Clerk-protected. Returns { url } of the stored object in R2.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const prefix = (form.get("prefix") as string) || "uploads";
  const kind = (form.get("kind") as string) || "image";
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // Punch photos stay image-only at 10 MB. Job files allow images, videos and
  // common documents at a larger cap — but never SVG/HTML and friends, which
  // execute script when served from our origin.
  if (kind === "job-file") {
    const MAX_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File is too large (max 50 MB)." }, { status: 413 });
    }
    const type = file.type || "";
    const isImage = type.startsWith("image/") && type !== "image/svg+xml";
    const isVideo = type.startsWith("video/");
    const docAllow = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "text/csv",
    ];
    if (!isImage && !isVideo && !docAllow.includes(type)) {
      return NextResponse.json({ error: "Unsupported file type." }, { status: 415 });
    }
  } else {
    const MAX_BYTES = 10 * 1024 * 1024;
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed." }, { status: 415 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image is too large (max 10 MB)." }, { status: 413 });
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${prefix}/${crypto.randomUUID()}-${safeName}`;

  try {
    const url = await uploadToR2(key, bytes, file.type || "application/octet-stream");
    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Upload failed" }, { status: 502 });
  }
}
