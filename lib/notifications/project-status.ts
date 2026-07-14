import { eq } from "drizzle-orm";
import { env } from "@/env";
import type { ProjectStatus } from "@/lib/actions/projects-logic";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { type Mailer, sendEmail } from "@/lib/email";
import { statusLabel } from "@/lib/labels";

/**
 * Notifikasi email ke klien saat status proyeknya berubah (PRD §9: menekan
 * chat manual "gimana progress?").
 *
 * Riwayat status sudah tampil di portal sejak Phase 7 — yang hilang adalah
 * dorongannya: klien tidak pernah tahu ada yang berubah kecuali ia membuka
 * portal sendiri. Modul ini mengisi bagian itu.
 *
 * Dipisah jadi dua bagian dengan sengaja: `buildStatusChangeEmail` murni (tidak
 * menyentuh DB maupun jaringan) sehingga salinan teksnya bisa dikunci test di
 * Vitest `environment: "node"`, dan `notifyClientOfStatusChange` yang mengurus
 * I/O-nya.
 */

export type StatusChangeEmailInput = {
  projectTitle: string;
  fromStatus: ProjectStatus;
  toStatus: ProjectStatus;
  /** Tautan ke halaman proyek di portal. `null` untuk klien tanpa akun portal. */
  portalUrl: string | null;
};

export function buildStatusChangeEmail({
  projectTitle,
  fromStatus,
  toStatus,
  portalUrl,
}: StatusChangeEmailInput): { subject: string; text: string } {
  const from = statusLabel[fromStatus] ?? fromStatus;
  const to = statusLabel[toStatus] ?? toStatus;

  const lines = [
    `Halo,`,
    ``,
    `Status proyek "${projectTitle}" berubah dari ${from} menjadi ${to}.`,
  ];

  // Klien tanpa akun portal tetap dapat kabarnya, tapi tidak diberi tautan yang
  // hanya akan memantulkannya ke halaman login yang tak bisa ia lewati.
  if (portalUrl) {
    lines.push(``, `Lihat detail proyek di portal: ${portalUrl}`);
  }

  lines.push(``, `— PKP Hub`);

  return {
    subject: `Proyek "${projectTitle}": status kini ${to}`,
    text: lines.join("\n"),
  };
}

export type NotifyResult =
  | { sent: true }
  | { sent: false; reason: "klien-tanpa-email" | "klien-tidak-ditemukan" };

/**
 * Cari email klien pemilik proyek, lalu kirim notifikasinya.
 *
 * Penerimanya SELALU diturunkan dari `project.clientId` di server — tidak
 * pernah dari input pemanggil — supaya staf tidak bisa mengarahkan notifikasi
 * ke alamat sembarangan.
 *
 * Melempar kalau pengiriman gagal. Pemanggilnya (`changeProjectStatusForUser`)
 * yang memutuskan bahwa kegagalan email tidak boleh membatalkan perubahan
 * status.
 */
export async function notifyClientOfStatusChange(
  input: {
    projectId: string;
    projectTitle: string;
    clientId: string;
    fromStatus: ProjectStatus;
    toStatus: ProjectStatus;
  },
  mailer: Mailer = sendEmail,
): Promise<NotifyResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId));

  if (!client) {
    return { sent: false, reason: "klien-tidak-ditemukan" };
  }
  if (!client.email) {
    return { sent: false, reason: "klien-tanpa-email" };
  }

  const { subject, text } = buildStatusChangeEmail({
    projectTitle: input.projectTitle,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    portalUrl: client.userId
      ? `${env.NEXT_PUBLIC_APP_URL}/portal/projects/${input.projectId}`
      : null,
  });

  await mailer({ to: client.email, subject, text });
  return { sent: true };
}
