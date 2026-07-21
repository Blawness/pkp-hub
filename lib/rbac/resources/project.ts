import { and, eq, exists, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectPhases, projects } from "@/lib/db/schema";
import { defineResource } from "../define-resource";
import type { ScopeFn } from "../types";

/**
 * Aturan scope proyek — SATU-SATUNYA tempat aturan ini ditulis.
 *
 * Diekspor terpisah karena resource lain (fase, peta, dokumen, pembayaran)
 * menurunkan scope-nya dari sini lewat `viaProject`. Tanpa itu, aturan
 * "surveyor melihat proyek yang ditugaskan padanya" akan tersalin ke lima
 * tempat dan mulai melenceng — persis bug yang diwanti-wanti komentar di
 * `lib/auth-guards.ts`.
 */
export const projectScopes: Record<"all" | "assigned" | "own", ScopeFn> = {
  all: () => sql`true`,

  // Ditugaskan langsung ke proyek, ATAU ke salah satu fasenya (spec
  // 2026-07-14). `exists` bukan join supaya proyek dengan dua fase milik
  // orang yang sama tidak muncul dua kali.
  assigned: (ctx) =>
    or(
      eq(projects.assignedSurveyorId, ctx.user.id),
      exists(
        db
          .select({ one: sql`1` })
          .from(projectPhases)
          .where(
            and(
              eq(projectPhases.projectId, projects.id),
              eq(projectPhases.assignedSurveyorId, ctx.user.id),
            ),
          ),
      ),
    ) as ReturnType<ScopeFn>,

  // User portal yang belum tertaut ke baris client menghasilkan himpunan
  // kosong. Sengaja BUKAN sentinel string: `clients.id` bertipe uuid, jadi
  // membandingkannya dengan string non-UUID membuat Postgres melempar
  // `invalid input syntax for type uuid`, bukan mengembalikan nol baris.
  own: (ctx) => (ctx.clientId ? eq(projects.clientId, ctx.clientId) : sql`false`),
};

export const projectResource = defineResource({
  name: "project",
  actions: ["read", "create", "update", "assignSurveyor", "changeStatus", "updateFinance"],
  table: { table: projects, id: projects.id },
  scopes: projectScopes,
});
