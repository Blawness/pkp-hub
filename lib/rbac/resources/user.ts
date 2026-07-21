import { sql } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import { defineResource } from "../define-resource";

export const userResource = defineResource({
  name: "user",
  actions: ["read", "create", "update", "setRole", "archive", "restore"],
  table: { table: users, id: users.id },
  scopes: { all: () => sql`true` },
});
