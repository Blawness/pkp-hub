/**
 * Kunci objek storage punya DUA prefix, dan keduanya punya aturan akses yang
 * berbeda — itulah kenapa parsingnya berdiri sendiri dan diuji sendiri:
 *
 * - `documents/<projectId>/...` — staf (admin + surveyor yang di-assign) dan,
 *   kalau `sharedWithClient`, klien pemiliknya.
 * - `receipts/<projectId>/...`  — admin dan klien pemiliknya. SURVEYOR TIDAK,
 *   meski proyeknya di-assign ke dia: kwitansi memuat nilai proyek, dan
 *   surveyor tidak boleh melihat keuangan.
 */
export type StorageKeyKind = "document" | "receipt";

export type ParsedStorageKey = {
  kind: StorageKeyKind;
  projectId: string;
};

const PREFIX_TO_KIND: Record<string, StorageKeyKind> = {
  documents: "document",
  receipts: "receipt",
};

export function parseStorageKey(key: string): ParsedStorageKey | null {
  const [prefix, projectId] = key.split("/");
  const kind = PREFIX_TO_KIND[prefix];
  if (!kind || !projectId) return null;
  return { kind, projectId };
}
