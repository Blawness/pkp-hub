import { defineResource } from "../define-resource";

/**
 * Tanpa tabel: role & permission bukan data per-baris-per-user, jadi tidak
 * ada yang perlu di-scope — hanya dipakai lewat `can()`. Dipisah dari `user`
 * supaya "siapa admin" dan "apa yang boleh dilakukan admin" tetap dua
 * permission independen — itulah yang membuat role `superuser` bermakna.
 */
export const roleResource = defineResource({
  name: "role",
  actions: ["read", "create", "update", "delete", "assign"],
});
