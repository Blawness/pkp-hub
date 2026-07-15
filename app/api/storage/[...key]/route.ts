import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertProjectAccess, requireAdmin, requireStaff, requireUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { documents, payments } from "@/lib/db/schema";
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
 *   meski proyeknya di-assign ke dia: kwitansi memuat nilai proyek, dan surveyor
 *   tidak boleh melihat keuangan. `assertProjectAccess` di bawah MELOLOSKAN
 *   surveyor yang di-assign, jadi penolakan surveyor harus berdiri sendiri,
 *   SEBELUM guard itu.
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

  // Gambar alat TIDAK terikat project — modul equipment staff-only, jadi
  // gerbangnya cukup `requireStaff` (tanpa `assertProjectAccess`).
  if (parsed.kind === "equipment") {
    await requireStaff();
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

  const user = await requireUser();

  // Kwitansi memuat nilai proyek. Surveyor TIDAK boleh melihat keuangan —
  // dan `assertProjectAccess` di bawah MELOLOSKAN surveyor yang di-assign,
  // jadi penolakan ini harus berdiri sendiri, sebelum guard itu.
  if (parsed.kind === "receipt" && user.role === "surveyor") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    await assertProjectAccess(parsed.projectId, user);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (parsed.kind === "document" && user.role === "client") {
    const [doc] = await db
      .select({ sharedWithClient: documents.sharedWithClient })
      .from(documents)
      .where(eq(documents.fileUrl, `/api/storage/${key}`));
    if (!doc?.sharedWithClient) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  if (parsed.kind === "receipt") {
    // Klien boleh mengunduh kwitansi proyeknya sendiri — `assertProjectAccess`
    // sudah memastikan proyek ini miliknya — TAPI bukan kwitansi yang sudah
    // dibatalkan: baris batal bukan bagian dari catatan uangnya.
    const [row] = await db
      .select({ voidedAt: payments.voidedAt })
      .from(payments)
      .where(eq(payments.receiptFileUrl, `/api/storage/${key}`));
    if (!row) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (user.role === "client" && row.voidedAt !== null) {
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

  // Gambar alat: PUT hanya admin, tanpa scoping project.
  if (parsed?.kind === "equipment") {
    await requireAdmin();
    const contentType = request.headers.get("content-type") ?? "application/octet-stream";
    const bytes = Buffer.from(await request.arrayBuffer());
    const url = await storage.put(key, bytes, contentType);
    return NextResponse.json({ url });
  }

  const user = await requireStaff();
  // Kwitansi TIDAK PERNAH diunggah lewat HTTP — ia ditulis server-side lewat
  // `storage.put`. Menerima PUT ke `receipts/` berarti membiarkan siapa pun
  // yang berstatus staf menimpa kwitansi dengan berkas karangannya sendiri.
  if (parsed?.kind !== "document") {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  try {
    await assertProjectAccess(parsed.projectId, user);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const bytes = Buffer.from(await request.arrayBuffer());
  const url = await storage.put(key, bytes, contentType);
  return NextResponse.json({ url });
}
