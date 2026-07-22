import { and, eq, isNull, sql } from "drizzle-orm";
import { recomputePaymentStatus } from "@/lib/actions/payments-logic";
import { db } from "@/lib/db";
import { payments, projects } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/can";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import type { RbacContext } from "@/lib/rbac/types";
import type { UpdatePaymentInput } from "./finance-schemas";

/**
 * Server-only business logic for Keuangan Ringan (PRD §3 Feature 5),
 * separated from the "use server" wrapper in `finance.ts` so it's directly
 * unit-testable (see `finance.test.ts`). Menegakkan izin lewat engine RBAC
 * (`project.updateFinance`, admin-only di matrix).
 *
 * CRITICAL: ini OWNER-ONLY, tanpa kecuali — surveyor tidak boleh set/baca
 * `projectValue` / `paymentStatus` / `paymentNotes` lewat jalur mana pun.
 * Fungsi yang menyentuh proyek tertentu WAJIB lewat `requireScopedRow` — bukan
 * `db.select()`/`db.update()` mentah yang cuma dijaga role.
 */

/**
 * `notFound()`'s digest for this Next.js version — same rationale as
 * `documents-logic.ts#isNotFoundDigest`: translate `requireScopedRow`'s
 * 404 signal into a plain rejection.
 */
function isNotFoundDigest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

async function requireProjectFinanceOrReject(ctx: RbacContext, projectId: string) {
  try {
    return await requireScopedRow(ctx, "project.updateFinance", projectId);
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Project not found or you do not have access to it.");
    }
    throw error;
  }
}

/** Uang yang sudah masuk per proyek (baris batal TIDAK dihitung). */
async function totalPaidForProject(projectId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
    .from(payments)
    .where(and(eq(payments.projectId, projectId), isNull(payments.voidedAt)));
  return row?.total ?? 0;
}

/**
 * Admin-only. Mengatur `projectValue` / `paymentNotes`. TIDAK lagi menerima
 * `paymentStatus` — status diturunkan dari ledger (`recomputePaymentStatus`),
 * dan mengubah nilai proyek bisa memindahkannya (nilai turun bisa membuat
 * proyek jadi lunas; naik bisa membuatnya kembali sebagian), jadi hitung ulang
 * itu terjadi di dalam transaksi yang sama.
 */
export async function updatePaymentForUser(ctx: RbacContext, input: UpdatePaymentInput) {
  assertCan(ctx, "project.updateFinance");
  await requireProjectFinanceOrReject(ctx, input.projectId);

  const totalPaid = await totalPaidForProject(input.projectId);
  if ((input.projectValue == null || input.projectValue === 0) && totalPaid > 0) {
    // Menghapus nilai proyek yang sudah ada uangnya membuat "sisa tagihan" dan
    // "lunas" kehilangan arti — dan diam-diam menghapus piutang dari dashboard.
    throw new Error(
      "Nilai proyek tidak bisa dikosongkan: proyek ini sudah punya pembayaran tercatat.",
    );
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(projects)
      .set({
        projectValue: input.projectValue,
        paymentNotes:
          input.paymentNotes && input.paymentNotes.length > 0 ? input.paymentNotes : null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, input.projectId))
      .returning();
    if (!updated) throw new Error("Project not found.");

    const status = await recomputePaymentStatus(tx, input.projectId);
    return { ...updated, paymentStatus: status };
  });
}
