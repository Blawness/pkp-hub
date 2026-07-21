import { sql } from "drizzle-orm";
import { equipmentItem } from "@/lib/db/schema";
import { defineResource } from "../define-resource";

/** Model/tipe alat. Membacanya ditanggung `equipment.read`. */
export const equipmentItemResource = defineResource({
  name: "equipmentItem",
  actions: ["create", "update", "archive"],
  table: { table: equipmentItem, id: equipmentItem.id },
  scopes: { all: () => sql`true` },
});
