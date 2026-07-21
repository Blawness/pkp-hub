import { sql } from "drizzle-orm";
import { clients } from "@/lib/db/schema";
import { defineResource } from "../define-resource";

/**
 * Manajemen klien admin-only (PRD §3 Feature 1). Hanya scope `all` yang
 * didefinisikan — memberi grant ber-scope `assigned`/`own` ke resource ini
 * menghasilkan himpunan kosong, bukan akses penuh (fail-closed).
 */
export const clientResource = defineResource({
  name: "client",
  actions: ["read", "create", "update", "archive"],
  table: { table: clients, id: clients.id },
  scopes: { all: () => sql`true` },
});
