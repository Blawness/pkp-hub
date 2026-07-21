import { defineResource } from "../define-resource";

/** Ekspor laporan (PDF/Excel). Tanpa tabel — hanya dipakai lewat `can()`. */
export const reportResource = defineResource({
  name: "report",
  actions: ["export"],
});
