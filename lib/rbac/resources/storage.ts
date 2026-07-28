import { defineResource } from "../define-resource";

/**
 * Penggunaan storage (R2) — superuser-only. Table-less: action-nya
 * query R2 API, bukan DB. `storage.cleanup` = hapus file yatim yang
 * tidak lagi direferensi dari kolom `file_url` / `receipt_file_url`.
 */
export const storageResource = defineResource({
  name: "storage",
  actions: ["read", "cleanup"],
});
