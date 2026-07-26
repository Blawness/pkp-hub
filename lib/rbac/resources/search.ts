import { defineResource } from "../define-resource";

/** Cmd-K global: cari klien/proyek/dokumen. Tanpa tabel — hanya lewat `can()`. */
export const searchResource = defineResource({
  name: "search",
  actions: ["use"],
});
