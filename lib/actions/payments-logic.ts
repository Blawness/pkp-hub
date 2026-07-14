import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PaymentStatus } from "@/lib/actions/finance-schemas";
import type {
  RecordPaymentInput,
  RegenerateReceiptInput,
  VoidPaymentInput,
} from "@/lib/actions/payments-schemas";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import type * as schema from "@/lib/db/schema";
import { clients, payments, projects } from "@/lib/db/schema";
import { surveyTypeLabel } from "@/lib/labels";
import { buildReceiptNumber, derivePaymentStatus } from "@/lib/payments/derive";
import { generateAndStoreReceipt, type ReceiptStorage } from "@/lib/receipts";
import type { ReceiptData } from "@/lib/receipts/template";
import { storage } from "@/lib/storage";

/**
 * Ledger pembayaran (spec 2026-07-14). Logika + guard dipisah dari pembungkus
 * "use server" di `payments.ts` supaya bisa diuji langsung (`payments.test.ts`),
 * pola yang sama dengan `finance-logic.ts`.
 *
 * CRITICAL — SURVEYOR TIDAK BOLEH MENYENTUH APA PUN DI SINI, termasuk untuk
 * proyek yang di-assign ke dia. Kwitansi memuat nilai proyek, jadi kebocoran
 * di modul ini meruntuhkan jaminan "surveyor tidak lihat keuangan" yang sudah
 * ditegakkan (dan diuji) di `dashboard-logic.ts` / `projects-logic.ts`.
 * Perhatikan: `assertProjectAccess` MELOLOSKAN surveyor yang di-assign — jadi
 * ia BUKAN guard yang cukup di sini. `requireAdmin` harus mendahuluinya.
 */

export type DbOrTx =
  | typeof db
  | PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type PaymentRow = {
  id: string;
  projectId: string;
  amount: number;
  paidAt: string;
  method: "transfer" | "tunai" | "lainnya";
  note: string | null;
  receiptNumber: string;
  receiptFileUrl: string | null;
  recordedById: string;
  voidedAt: Date | null;
  voidedReason: string | null;
  createdAt: Date;
};

export type PaymentSummary = {
  projectValue: number | null;
  totalPaid: number;
  remaining: number;
  status: PaymentStatus;
};

export type ReceiptArchiveRow = {
  id: string;
  receiptNumber: string;
  amount: number;
  paidAt: string;
  method: string;
  projectTitle: string | null;
  clientName: string | null;
  receiptFileUrl: string | null;
  isVoided: boolean;
};

/**
 * Admin-only. Semua kwitansi (baris pembayaran yang TIDAK dibatalkan) lintas
 * proyek, untuk tab "Kwitansi" di Arsip Dokumen. Sengaja dipisah dari tabel
 * `documents` — lihat catatan di atas: kwitansi memuat nilai proyek, jadi tidak
 * boleh masuk ke Arsip yang terlihat surveyor. Surveyor memanggil ini akan
 * ditolak oleh `requireAdmin`.
 */
export async function listReceiptsForAdmin(user: SessionUser): Promise<ReceiptArchiveRow[]> {
  requireAdmin(user);

  const rows = await db
    .select({
      id: payments.id,
      receiptNumber: payments.receiptNumber,
      amount: payments.amount,
      paidAt: payments.paidAt,
      method: payments.method,
      projectTitle: projects.title,
      clientName: clients.name,
      receiptFileUrl: payments.receiptFileUrl,
      voidedAt: payments.voidedAt,
    })
    .from(payments)
    .innerJoin(projects, eq(payments.projectId, projects.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(isNull(payments.voidedAt))
    .orderBy(desc(payments.paidAt));

  // `receiptFileUrl` mentah yang diserahkan ke pemanggil; presigned URL-nya
  // dibuat di lapisan halaman (sama seperti `documents-logic`) supaya layer
  // logika tidak bergantung pada driver storage yang aktif.
  return rows.map((r) => ({
    id: r.id,
    receiptNumber: r.receiptNumber,
    amount: r.amount,
    paidAt: r.paidAt,
    method: r.method,
    projectTitle: r.projectTitle,
    clientName: r.clientName,
    receiptFileUrl: r.receiptFileUrl,
    isVoided: r.voidedAt !== null,
  }));
}

function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    throw new Error("Only the admin can manage payments.");
  }
}

/** Sama seperti `finance-logic.ts`: ubah sinyal 404 `notFound()` jadi penolakan biasa. */
function isNotFoundDigest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

async function assertProjectAccessOrReject(projectId: string, user: SessionUser) {
  try {
    return await assertProjectAccess(projectId, user);
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Project not found or you do not have access to it.");
    }
    throw error;
  }
}

/** Total uang masuk (baris batal TIDAK dihitung). */
async function totalPaidFor(handle: DbOrTx, projectId: string): Promise<number> {
  const [row] = await handle
    .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
    .from(payments)
    .where(and(eq(payments.projectId, projectId), isNull(payments.voidedAt)));
  return row?.total ?? 0;
}

/**
 * Hitung ulang `projects.paymentStatus` dari ledger dan tulis balik.
 *
 * WAJIB dipanggil di dalam transaksi yang sama dengan perubahan yang memicunya
 * (insert pembayaran, pembatalan, atau perubahan `projectValue`). Di luar
 * transaksi, dua perubahan bersamaan bisa saling menimpa dan meninggalkan
 * kolom status yang tidak cocok dengan uangnya.
 */
export async function recomputePaymentStatus(
  handle: DbOrTx,
  projectId: string,
): Promise<PaymentStatus> {
  const [project] = await handle
    .select({ projectValue: projects.projectValue })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) throw new Error("Project not found.");

  const totalPaid = await totalPaidFor(handle, projectId);
  const status = derivePaymentStatus(totalPaid, project.projectValue);

  await handle
    .update(projects)
    .set({ paymentStatus: status, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  return status;
}

/** Nomor urut kwitansi berikutnya. Sequence Postgres — tidak bisa kembar. */
async function nextReceiptSeq(handle: DbOrTx): Promise<number> {
  const result = await handle.execute(sql`SELECT nextval('receipt_number_seq') AS seq`);
  const rows = (result as unknown as { rows: { seq: string | number }[] }).rows;
  return Number(rows[0].seq);
}

/** Admin: semua baris. Klien: hanya proyeknya sendiri, dan hanya baris yang TIDAK dibatalkan. */
export async function listPaymentsForProject(
  user: SessionUser,
  projectId: string,
): Promise<PaymentRow[]> {
  if (user.role === "surveyor") {
    throw new Error("Surveyors cannot view payments.");
  }
  await assertProjectAccessOrReject(projectId, user);

  const where =
    user.role === "client"
      ? and(eq(payments.projectId, projectId), isNull(payments.voidedAt))
      : eq(payments.projectId, projectId);

  return db.select().from(payments).where(where).orderBy(desc(payments.paidAt));
}

export async function getPaymentSummary(
  user: SessionUser,
  projectId: string,
): Promise<PaymentSummary> {
  if (user.role === "surveyor") {
    throw new Error("Surveyors cannot view payments.");
  }
  const project = await assertProjectAccessOrReject(projectId, user);

  const totalPaid = await totalPaidFor(db, projectId);
  const projectValue = project.projectValue ?? null;
  return {
    projectValue,
    totalPaid,
    remaining: Math.max(0, (projectValue ?? 0) - totalPaid),
    status: derivePaymentStatus(totalPaid, projectValue),
  };
}

/** Rakit data kwitansi. Dipakai saat mencatat, membatalkan, dan membuat ulang. */
async function receiptDataFor(payment: PaymentRow): Promise<ReceiptData> {
  const [project] = await db.select().from(projects).where(eq(projects.id, payment.projectId));
  const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
  const totalPaid = await totalPaidFor(db, payment.projectId);
  const projectValue = project.projectValue ?? 0;

  return {
    receiptNumber: payment.receiptNumber,
    paidAt: payment.paidAt,
    amount: payment.amount,
    method: payment.method,
    note: payment.note,
    clientName: client?.name ?? "—",
    projectTitle: project.title,
    surveyTypeLabel: surveyTypeLabel[project.surveyType] ?? project.surveyType,
    projectValue,
    totalPaid,
    remaining: Math.max(0, projectValue - totalPaid),
    voidedReason: payment.voidedReason,
  };
}

/**
 * Terbitkan kwitansi dan simpan URL-nya — TANPA pernah melempar.
 *
 * Dipanggil DI LUAR transaksi, dan errornya sengaja ditelan + di-log. Alasannya
 * sama persis dengan notifikasi email Phase 11: kalau kwitansi dibuat di dalam
 * transaksi, R2 yang down membuat studio tidak bisa mencatat uang yang sudah
 * masuk sama sekali. Pekerjaan sampingan tidak boleh mengalahkan pekerjaan
 * sungguhan. Baris tetap ada, `receiptFileUrl` null, UI menawarkan "Buat ulang".
 */
async function issueReceiptQuietly(
  payment: PaymentRow,
  store: ReceiptStorage,
): Promise<string | null> {
  try {
    const data = await receiptDataFor(payment);
    const fileUrl = await generateAndStoreReceipt(payment.projectId, data, store);
    await db.update(payments).set({ receiptFileUrl: fileUrl }).where(eq(payments.id, payment.id));
    return fileUrl;
  } catch (error) {
    console.error(`[kwitansi] gagal membuat kwitansi ${payment.receiptNumber}:`, error);
    return null;
  }
}

/** Admin-only. Catat satu pembayaran; status proyek ikut dihitung ulang. */
export async function recordPaymentForUser(
  user: SessionUser,
  input: RecordPaymentInput,
  store: ReceiptStorage = storage,
): Promise<PaymentRow> {
  requireAdmin(user);
  const project = await assertProjectAccessOrReject(input.projectId, user);

  if (project.projectValue == null || project.projectValue <= 0) {
    throw new Error("Isi nilai proyek dulu sebelum mencatat pembayaran.");
  }

  const payment = await db.transaction(async (tx) => {
    const seq = await nextReceiptSeq(tx);
    const [row] = await tx
      .insert(payments)
      .values({
        projectId: input.projectId,
        amount: input.amount,
        paidAt: input.paidAt,
        method: input.method,
        note: input.note && input.note.length > 0 ? input.note : null,
        receiptNumber: buildReceiptNumber(seq, input.paidAt),
        recordedById: user.id,
      })
      .returning();
    await recomputePaymentStatus(tx, input.projectId);
    return row;
  });

  const fileUrl = await issueReceiptQuietly(payment, store);
  return { ...payment, receiptFileUrl: fileUrl };
}

/**
 * Admin-only. Batalkan satu pembayaran. Barisnya TIDAK dihapus — ledger
 * append-only — dan kwitansinya diterbitkan ulang membawa cap DIBATALKAN di
 * kunci yang sama, sehingga unduhan berikutnya jujur.
 */
export async function voidPaymentForUser(
  user: SessionUser,
  input: VoidPaymentInput,
  store: ReceiptStorage = storage,
): Promise<PaymentRow> {
  requireAdmin(user);

  const [existing] = await db.select().from(payments).where(eq(payments.id, input.paymentId));
  if (!existing) throw new Error("Payment not found.");
  await assertProjectAccessOrReject(existing.projectId, user);
  if (existing.voidedAt) throw new Error("Pembayaran ini sudah dibatalkan.");

  const payment = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(payments)
      .set({ voidedAt: new Date(), voidedReason: input.reason, voidedById: user.id })
      .where(eq(payments.id, input.paymentId))
      .returning();
    await recomputePaymentStatus(tx, row.projectId);
    return row;
  });

  await issueReceiptQuietly(payment, store);
  return payment;
}

/** Admin-only. Buat ulang kwitansi yang sebelumnya gagal terbit (`receiptFileUrl` null). */
export async function regenerateReceiptForUser(
  user: SessionUser,
  input: RegenerateReceiptInput,
  store: ReceiptStorage = storage,
): Promise<PaymentRow> {
  requireAdmin(user);

  const [existing] = await db.select().from(payments).where(eq(payments.id, input.paymentId));
  if (!existing) throw new Error("Payment not found.");
  await assertProjectAccessOrReject(existing.projectId, user);

  const fileUrl = await issueReceiptQuietly(existing, store);
  if (!fileUrl) throw new Error("Kwitansi gagal dibuat. Coba lagi.");
  return { ...existing, receiptFileUrl: fileUrl };
}
