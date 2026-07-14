import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { changeProjectStatusForUser } from "@/lib/actions/projects-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";
import type { EmailMessage } from "@/lib/email";
import {
  buildStatusChangeEmail,
  notifyClientOfStatusChange,
} from "@/lib/notifications/project-status";

/**
 * Notifikasi status ke klien (PRD §9).
 *
 * Dua hal yang dijaga di sini:
 *  1. Penerima dan isi email diturunkan dari data proyek di server.
 *  2. **Email yang gagal tidak boleh membatalkan perubahan status.** Ini
 *     invarian yang paling mahal kalau jebol: Resend down berarti studio tidak
 *     bisa memajukan proyek sama sekali.
 *
 * Berjalan di atas DB dev (Neon) yang sama seperti test lain; mailer-nya palsu
 * supaya tidak ada email sungguhan yang terkirim.
 */

let admin: SessionUser;
let projectWithPortalId: string;
let clientWithPortalId: string;
let clientNoEmailId: string;

beforeAll(async () => {
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const portalUserId = randomUUID();

  await db.insert(users).values([
    { id: adminId, name: "Test Admin", email: "test-admin-notif@fixture.test", role: "admin" },
    {
      id: portalUserId,
      name: "Klien Berportal",
      email: "klien-portal@fixture.test",
      role: "client",
    },
  ]);

  admin = {
    id: adminId,
    name: "Test Admin",
    email: "test-admin-notif@fixture.test",
    role: "admin",
  };

  const [withPortal] = await db
    .insert(clients)
    .values({
      name: "Klien Berportal",
      type: "individual",
      email: "klien-portal@fixture.test",
      userId: portalUserId,
    })
    .returning();
  clientWithPortalId = withPortal.id;

  const [noEmail] = await db
    .insert(clients)
    .values({ name: "Klien Tanpa Email", type: "individual" })
    .returning();
  clientNoEmailId = noEmail.id;

  const [project] = await db
    .insert(projects)
    .values({
      title: "Pengukuran Kavling Cibubur",
      clientId: withPortal.id,
      surveyType: "kavling",
      status: "baru",
    })
    .returning();
  projectWithPortalId = project.id;
});

describe("buildStatusChangeEmail", () => {
  it("menyebut status lama dan baru dalam Bahasa Indonesia, bukan nilai enum mentah", () => {
    const { subject, text } = buildStatusChangeEmail({
      projectTitle: "Pengukuran Kavling Cibubur",
      fromStatus: "data_diambil",
      toStatus: "diproses",
      portalUrl: "https://pkp.example/portal/projects/abc",
    });

    expect(subject).toBe('Proyek "Pengukuran Kavling Cibubur": status kini Diproses');
    expect(text).toContain("dari Data Diambil menjadi Diproses");
    // Enum mentah bocor ke klien = salinan yang tidak bisa dibaca orang awam.
    expect(text).not.toContain("data_diambil");
  });

  it("menyertakan tautan portal saat klien punya akun", () => {
    const { text } = buildStatusChangeEmail({
      projectTitle: "Proyek A",
      fromStatus: "baru",
      toStatus: "dijadwalkan",
      portalUrl: "https://pkp.example/portal/projects/abc",
    });

    expect(text).toContain("https://pkp.example/portal/projects/abc");
  });

  it("TIDAK menyertakan tautan saat klien belum punya akun portal", () => {
    const { text } = buildStatusChangeEmail({
      projectTitle: "Proyek A",
      fromStatus: "baru",
      toStatus: "dijadwalkan",
      portalUrl: null,
    });

    // Tautan yang cuma memantul ke halaman login lebih buruk daripada tanpa
    // tautan: klien mengira akunnya rusak.
    expect(text).not.toContain("http");
    expect(text).toContain("Proyek A");
  });
});

describe("notifyClientOfStatusChange", () => {
  it("mengirim ke email klien pemilik proyek", async () => {
    const sent: EmailMessage[] = [];

    const result = await notifyClientOfStatusChange(
      {
        projectId: projectWithPortalId,
        projectTitle: "Pengukuran Kavling Cibubur",
        clientId: clientWithPortalId,
        fromStatus: "baru",
        toStatus: "dijadwalkan",
      },
      async (message) => {
        sent.push(message);
      },
    );

    expect(result).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("klien-portal@fixture.test");
    expect(sent[0].subject).toContain("Dijadwalkan");
    expect(sent[0].text).toContain(`/portal/projects/${projectWithPortalId}`);
  });

  it("tidak mengirim apa pun kalau klien tidak punya email", async () => {
    const sent: EmailMessage[] = [];

    const result = await notifyClientOfStatusChange(
      {
        projectId: projectWithPortalId,
        projectTitle: "Proyek Tanpa Email",
        clientId: clientNoEmailId,
        fromStatus: "baru",
        toStatus: "dijadwalkan",
      },
      async (message) => {
        sent.push(message);
      },
    );

    expect(result).toEqual({ sent: false, reason: "klien-tanpa-email" });
    expect(sent).toHaveLength(0);
  });
});

describe("changeProjectStatusForUser + notifikasi", () => {
  it("mengabari klien setelah status berubah", async () => {
    const sent: EmailMessage[] = [];

    await changeProjectStatusForUser(
      admin,
      { projectId: projectWithPortalId, toStatus: "dijadwalkan" },
      async (input) =>
        notifyClientOfStatusChange(input, async (message) => {
          sent.push(message);
        }),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("klien-portal@fixture.test");
    expect(sent[0].subject).toContain("Dijadwalkan");
  });

  it("status TETAP berubah walau pengiriman email gagal", async () => {
    // Positive control: transisi ini memang sah, jadi kalau assertion di bawah
    // gagal itu karena notifikasinya, bukan karena transisinya ditolak.
    const updated = await changeProjectStatusForUser(
      admin,
      { projectId: projectWithPortalId, toStatus: "data_diambil" },
      async () => {
        throw new Error("Resend sedang down");
      },
    );

    expect(updated.status).toBe("data_diambil");

    const [row] = await db.select().from(projects).where(eq(projects.id, projectWithPortalId));
    expect(row.status).toBe("data_diambil");

    // Dan log statusnya tetap tertulis — transaksinya commit, bukan ter-rollback
    // diam-diam oleh error email.
    const logs = await db
      .select()
      .from(projectStatusLogs)
      .where(eq(projectStatusLogs.projectId, projectWithPortalId));
    expect(logs.some((l) => l.toStatus === "data_diambil")).toBe(true);
  });
});
