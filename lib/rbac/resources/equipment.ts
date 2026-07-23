import { sql } from "drizzle-orm";
import { equipment } from "@/lib/db/schema";
import { defineResource } from "../define-resource";

/**
 * Inventaris tidak per-proyek: surveyor melihat SELURUH alat, bukan hanya
 * alat proyeknya. Itu terekspresikan sebagai grant ber-scope `all` untuk
 * role surveyor, bukan sebagai pengecualian di engine.
 */
export const equipmentResource = defineResource({
  name: "equipment",
  actions: ["read", "create", "update", "archive", "borrow", "return", "correctUsage", "readCost"],
  table: { table: equipment, id: equipment.id },
  scopes: { all: () => sql`true` },
  // Harga & tanggal beli hanya untuk admin (`equipment.readCost`), dipangkas
  // dari SELECT untuk surveyor.
  fields: {
    purchasePrice: "equipment.readCost",
    purchaseDate: "equipment.readCost",
  },
});
