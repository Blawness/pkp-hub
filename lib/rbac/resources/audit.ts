import { sql } from "drizzle-orm";
import { auditLog } from "@/lib/db/schema";
import { defineResource } from "../define-resource";

/**
 * Log audit — superuser-only. Tabel `audit_log` sudah ada sejak Phase 1;
 * resource ini hanya membungkusnya dengan permission `audit.read`.
 * Scope `all`: superuser melihat seluruh log tanpa batasan.
 */
export const auditResource = defineResource({
  name: "audit",
  actions: ["read"],
  table: { table: auditLog, id: auditLog.id },
  scopes: { all: () => sql`true` },
});
