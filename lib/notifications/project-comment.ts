import { eq } from "drizzle-orm";
import { env } from "@/env";
import { db } from "@/lib/db";
import { clients, type comments, projects, users } from "@/lib/db/schema";
import { type Mailer, sendEmail } from "@/lib/email";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Notifikasi email saat ada komentar baru di proyek (F-2025-07-005).
 *
 * Pola sama dengan `project-status.ts`: penerima diturunkan dari data proyek
 * di server, bukan dari input pemanggil. Kegagalan email tidak membatalkan
 * comment (pemanggil di `comments-logic.ts` yang memutuskan).
 *
 * Aturan penerima:
 *  - Komentar dari KLIEN → email ke surveyor yang ditugaskan + admin
 *  - Komentar dari STAF → email ke klien (jika punya akun portal + email)
 */

export type CommentEmailInput = {
  projectTitle: string;
  authorName: string;
  body: string;
  portalUrl: string | null;
};

export function buildCommentEmail({
  projectTitle,
  authorName,
  body,
  portalUrl,
}: CommentEmailInput): { subject: string; text: string } {
  // Potong body untuk preview email (maks 200 char).
  const preview = body.length > 200 ? `${body.slice(0, 200)}…` : body;

  const lines = [
    `Halo,`,
    ``,
    `${authorName} mengirim pesan baru di proyek "${projectTitle}":`,
    ``,
    `"${preview}"`,
  ];

  if (portalUrl) {
    lines.push(``, `Balas di portal: ${portalUrl}`);
  }

  lines.push(``, `— PKP Hub`);

  return {
    subject: `Pesan baru di "${projectTitle}" dari ${authorName}`,
    text: lines.join("\n"),
  };
}

export type NotifyCommentResult = { sent: true; to: string[] } | { sent: false; reason: string };

/**
 * Kirim notifikasi email soal komentar baru.
 *
 * `ctx.user.role` menentukan arah:
 *  - client → staff (surveyor assigned + semua admin)
 *  - staff → client (jika punya email + portal account)
 */
export async function notifyProjectOfNewComment(
  ctx: RbacContext,
  comment: typeof comments.$inferSelect,
  mailer: Mailer = sendEmail,
): Promise<NotifyCommentResult> {
  const [project] = await db.select().from(projects).where(eq(projects.id, comment.projectId));

  if (!project) {
    return { sent: false, reason: "proyek-tidak-ditemukan" };
  }

  const isClient = ctx.user.role === "client";
  const recipients: string[] = [];

  if (isClient) {
    // Klien → staff: surveyor yang ditugaskan + semua admin aktif.
    if (project.assignedSurveyorId) {
      const [surveyor] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, project.assignedSurveyorId));
      if (surveyor?.email) recipients.push(surveyor.email);
    }

    const admins = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.role, "admin"));
    for (const admin of admins) {
      if (admin.email && !recipients.includes(admin.email)) {
        recipients.push(admin.email);
      }
    }
  } else {
    // Staff → klien: cari email klien pemilik proyek.
    const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));

    if (client?.email && client.userId) {
      recipients.push(client.email);
    }
  }

  if (recipients.length === 0) {
    return { sent: false, reason: "tidak-ada-penerima" };
  }

  const { subject, text } = buildCommentEmail({
    projectTitle: project.title,
    authorName: ctx.user.name,
    body: comment.body,
    portalUrl: isClient
      ? null // Staff tidak perlu link portal
      : `${env.NEXT_PUBLIC_APP_URL}/portal/projects/${project.id}`,
  });

  // Kirim ke semua penerima (BCC untuk privasi).
  await Promise.all(recipients.map((to) => mailer({ to, subject, text })));

  return { sent: true, to: recipients };
}
