import { defineResource } from "../define-resource";

/**
 * Manajemen sesi user — superuser-only. Table-less: action-nya query
 * tabel `session` Better Auth langsung dari logic layer.
 * `session.revoke` = cabut sesi user lain (hapus baris `session`).
 */
export const sessionResource = defineResource({
  name: "session",
  actions: ["read", "revoke"],
});
