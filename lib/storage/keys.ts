/**
 * Kunci objek storage punya DUA prefix, dan keduanya punya aturan akses yang
 * berbeda — itulah kenapa parsingnya berdiri sendiri dan diuji sendiri:
 *
 * - `documents/<projectId>/...` — staf (admin + surveyor yang di-assign) dan,
 *   kalau `sharedWithClient`, klien pemiliknya.
 * - `receipts/<projectId>/...`  — admin dan klien pemiliknya. SURVEYOR TIDAK,
 *   meski proyeknya di-assign ke dia: kwitansi memuat nilai proyek, dan
 *   surveyor tidak boleh melihat keuangan.
 * - `equipment/<uuid>.webp`     — gambar alat. TIDAK terikat project: GET untuk
 *   semua staf, PUT hanya admin. Karena itu `projectId` tidak ada di sini.
 */
export type StorageKeyKind = "document" | "receipt" | "equipment";

export type ParsedStorageKey =
  | { kind: "document" | "receipt"; projectId: string }
  | { kind: "equipment"; projectId?: undefined };

const PREFIX_TO_KIND: Record<string, StorageKeyKind> = {
  documents: "document",
  receipts: "receipt",
  equipment: "equipment",
};

export function parseStorageKey(key: string): ParsedStorageKey | null {
  const [prefix, rest] = key.split("/");
  const kind = PREFIX_TO_KIND[prefix];
  if (!kind) return null;

  // Gambar alat tidak project-scoped: `equipment/<uuid>.webp`. Cukup ada
  // segmen kedua yang tidak kosong sebagai nama objek.
  if (kind === "equipment") {
    if (!rest) return null;
    return { kind };
  }

  if (!rest) return null;
  return { kind, projectId: rest };
}
