import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, payments } from "@/lib/db/schema";
import { can, scopeOf } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";
import { rbacFilter } from "@/lib/rbac/filter";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import { storage } from "@/lib/storage";
import { parseStorageKey } from "@/lib/storage/keys";
import { readLocalFile } from "@/lib/storage/local-driver";

/**
 * Serves (GET) and accepts (PUT) object bytes for the LOCAL storage driver
 * only (Phase 4 brief — dev fallback when R2 env vars are absent). When the
 * r2 driver is active this route 404s: R2 objects are uploaded to /
 * downloaded from R2 directly via presigned URLs, never through the app.
 *
 * Kunci objek punya DUA prefix, masing-masing dengan aturan akses berbeda:
 *
 * - `documents/<projectId>/...` — staf (admin + surveyor yang di-assign) dan,
 *   kalau `sharedWithClient`, klien pemiliknya.
 * - `receipts/<projectId>/...`  — admin dan klien pemiliknya. SURVEYOR TIDAK,
 *   meski proyeknya di-assign ke dia: kwitansi memuat nilai proyek, dan
 *   surveyor tidak punya `payment.read` sama sekali. `requireScopedRow` proyek
 *   di bawah MELOLOSKAN surveyor yang di-assign, jadi penolakan itu harus
 *   berdiri sendiri, SEBELUM guard proyek.
 */

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  csv: "text/csv",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function guessContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (storage.name !== "local") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { key: keyParts } = await params;
  const key = keyParts.join("/");

  const parsed = parseStorageKey(key);
  if (!parsed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const ctx = await getRbacContext();

  // Gambar alat TIDAK terikat project — gerbangnya cukup `equipment.read`
  // (admin + surveyor; klien tidak), tanpa scoping baris.
  if (parsed.kind === "equipment") {
    if (!can(ctx, "equipment.read")) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    try {
      const buffer = await readLocalFile(key);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": guessContentType(key),
          "Cache-Control": "private, max-age=0, no-store",
        },
      });
    } catch {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  // Kwitansi memuat nilai proyek. Surveyor tidak punya `payment.read` sama
  // sekali — dan guard proyek di bawah MELOLOSKAN surveyor yang di-assign,
  // jadi penolakan ini harus berdiri sendiri, sebelum guard itu.
  if (parsed.kind === "receipt" && !can(ctx, "payment.read")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    await requireScopedRow(ctx, "project.read", parsed.projectId);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Pembaca ber-scope `own` (klien) hanya boleh dokumen yang SUDAH dibagikan.
  // Scope `own` resource document sudah memuat syarat `sharedWithClient` —
  // satu query ter-scope menggantikan cek role manual.
  if (parsed.kind === "document" && scopeOf(ctx, "document.read") === "own") {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.fileUrl, `/api/storage/${key}`), rbacFilter(ctx, "document.read")));
    if (!doc) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  if (parsed.kind === "receipt") {
    // Klien boleh mengunduh kwitansi proyeknya sendiri — guard proyek di atas
    // sudah memastikan proyek ini miliknya — TAPI bukan kwitansi yang sudah
    // dibatalkan: baris batal bukan bagian dari catatan uangnya.
    const [row] = await db
      .select({ voidedAt: payments.voidedAt })
      .from(payments)
      .where(eq(payments.receiptFileUrl, `/api/storage/${key}`));
    if (!row) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (scopeOf(ctx, "payment.read") === "own" && row.voidedAt !== null) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  try {
    const buffer = await readLocalFile(key);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": guessContentType(key),
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (storage.name !== "local") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { key: keyParts } = await params;
  const key = keyParts.join("/");

  const parsed = parseStorageKey(key);
  const ctx = await getRbacContext();

  // Gambar alat: PUT butuh `equipment.update` (admin-only), tanpa scoping baris
  // — izin yang sama dengan `/api/equipment/upload-init`.
  if (parsed?.kind === "equipment") {
    if (!can(ctx, "equipment.update")) {
      return NextResponse.json({ error: "Anda tidak punya izin." }, { status: 403 });
    }
    const contentType = request.headers.get("content-type") ?? "application/octet-stream";
    const bytes = Buffer.from(await request.arrayBuffer());
    const url = await storage.put(key, bytes, contentType);
    return NextResponse.json({ url });
  }

  // `document.upload` + scope proyek — pasangan cek yang sama dengan
  // `/api/documents/upload-init` dan `uploadDocumentForUser`.
  if (!can(ctx, "document.upload")) {
    return NextResponse.json({ error: "Anda tidak punya izin." }, { status: 403 });
  }
  // Kwitansi TIDAK PERNAH diunggah lewat HTTP — ia ditulis server-side lewat
  // `storage.put`. Menerima PUT ke `receipts/` berarti membiarkan siapa pun
  // yang berstatus staf menimpa kwitansi dengan berkas karangannya sendiri.
  if (parsed?.kind !== "document") {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  try {
    await requireScopedRow(ctx, "project.read", parsed.projectId);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const bytes = Buffer.from(await request.arrayBuffer());
  const url = await storage.put(key, bytes, contentType);
  return NextResponse.json({ url });
}
