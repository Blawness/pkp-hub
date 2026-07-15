import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";
import { storage } from "@/lib/storage";

/**
 * Menerbitkan upload target untuk gambar alat. Sejalan dengan
 * `/api/documents/upload-init`: body-nya hanya metadata kecil, byte-nya
 * di-upload langsung ke target (presigned PUT R2, atau `/api/storage/[...key]`
 * untuk driver lokal) — TIDAK lewat server action.
 *
 * Beda dengan dokumen: gambar alat TIDAK terikat project, jadi tidak ada
 * `assertProjectAccess`. Gerbangnya `requireAdmin` — hanya admin yang mengelola
 * data alat. Byte-nya sudah dikonversi ke WebP di klien, jadi di sini kita
 * memaksa `image/webp` dan membatasi ukurannya.
 */

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  await requireAdmin();

  const json = await request.json().catch(() => null);
  const contentType = json?.contentType;
  const fileSize = json?.fileSize;

  if (contentType !== "image/webp") {
    return NextResponse.json({ error: "Gambar harus berformat WebP." }, { status: 400 });
  }
  if (typeof fileSize !== "number" || fileSize <= 0) {
    return NextResponse.json({ error: "Ukuran file tidak valid." }, { status: 400 });
  }
  if (fileSize > MAX_SIZE) {
    return NextResponse.json({ error: "Ukuran gambar maksimum 5MB." }, { status: 400 });
  }

  const key = `equipment/${randomUUID()}.webp`;
  const target = await storage.getUploadUrl(key, contentType);
  return NextResponse.json(target);
}
