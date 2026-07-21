import { and, eq, exists, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import type { ScopeFn } from "../types";

/**
 * Menurunkan scope sebuah tabel anak dari scope proyek induknya.
 *
 * `projectIdColumn` adalah kolom `project_id` milik tabel anak; subquery-nya
 * berkorelasi dengannya, jadi predikat yang dihasilkan bisa langsung dipakai
 * di `where` tabel anak.
 */
export function viaProject(projectIdColumn: PgColumn, projectScope: ScopeFn): ScopeFn {
  return (ctx) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(projects)
        .where(and(eq(projects.id, projectIdColumn), projectScope(ctx))),
    ) as ReturnType<ScopeFn>;
}
