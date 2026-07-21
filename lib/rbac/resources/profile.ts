import { defineResource } from "../define-resource";

/**
 * Tanpa tabel: aksinya selalu menyasar baris user yang sedang login, jadi
 * tidak ada yang perlu di-scope. Hanya dipakai lewat `can()`.
 */
export const profileResource = defineResource({
  name: "profile",
  actions: ["updateOwn"],
});
