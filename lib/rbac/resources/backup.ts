import { defineResource } from "../define-resource";

/**
 * Ekspor/impor data penuh — superuser-only. Table-less: action-nya
 * dump seluruh tabel ke JSON (ekspor) atau restore dari JSON (impor).
 * Tindakan destruktif + privasi — tidak diberikan ke admin.
 */
export const backupResource = defineResource({
  name: "backup",
  actions: ["export", "import"],
});
