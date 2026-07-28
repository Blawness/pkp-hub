import { defineResource } from "../define-resource";

/**
 * Konfigurasi sistem (nama studio, logo, dsb.) — admin + superuser.
 * Table-less untuk sekarang; nanti bisa ditambah tabel `settings` kalau
 * perlu menyimpan konfigurasi di DB.
 */
export const settingsResource = defineResource({
  name: "settings",
  actions: ["read", "update"],
});
