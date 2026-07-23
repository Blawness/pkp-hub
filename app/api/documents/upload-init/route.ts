import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { uploadInitInputSchema } from "@/lib/actions/documents-schemas";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import { storage } from "@/lib/storage";

/**
 * Issues an upload target for a new document's bytes (Phase 4 brief:
 * "uploads must NOT go through a Server Action body"). This route handler
 * only ever receives a tiny JSON body (file name/size/type) — never the
 * file bytes themselves:
 *  - r2 driver: returns a presigned PUT URL the client uploads directly to.
 *  - local driver: returns this app's own `/api/storage/[...key]` route,
 *    which accepts the raw bytes via PUT.
 *
 * Same security boundary as everywhere else: `document.upload` (admin +
 * surveyor) lalu `requireScopedRow(ctx, "project.read", …)` — pasangan cek
 * yang sama dengan `uploadDocumentForUser` di documents-logic; surveyor tak
 * bisa mencetak target upload untuk proyek yang bukan tugasnya.
 */
export async function POST(request: Request) {
  const ctx = await getRbacContext();
  if (!can(ctx, "document.upload")) {
    return NextResponse.json({ error: "Anda tidak punya izin." }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = uploadInitInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid." }, { status: 400 });
  }
  const { projectId, fileName, contentType, fileSize } = parsed.data;

  // 404s (via `notFound()`) if this user cannot access the project; that
  // digest isn't meaningful as an HTTP response body here, so translate any
  // thrown error into a plain 403/404 JSON response.
  try {
    await requireScopedRow(ctx, "project.read", projectId);
  } catch {
    return NextResponse.json(
      { error: "Project not found or you do not have access to it." },
      { status: 404 },
    );
  }

  const MAX_SIZE = 100 * 1024 * 1024; // 100 MB
  if (fileSize > MAX_SIZE) {
    return NextResponse.json({ error: "Ukuran file maksimum 100MB." }, { status: 400 });
  }

  const ALLOWED_MIME = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/tiff",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-word",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
  ]);
  if (!ALLOWED_MIME.has(contentType)) {
    return NextResponse.json({ error: "Tipe file tidak diizinkan." }, { status: 400 });
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `documents/${projectId}/${randomUUID()}-${safeName}`;

  const target = await storage.getUploadUrl(key, contentType);
  return NextResponse.json(target);
}
