# Client Notifications on Status & Document Changes — Implementation Plan

> **For agentik workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saat proyek klien berubah status ke `selesai` atau dokumen baru di-share ke portal, sistem mengirim email ke klien dengan tautan dan ringkasan singkat — menjadikan portal tidak hanya read-only pasif, melainkan ada notifikasi yang menarik klien kembali.

**Architecture:** Layer tipis di `lib/notifications/` (folder baru). Modul `clientNotifier` dengan interface `notifyStatusChange` dan `notifyDocumentShared` yang:
1. Memuat proyek + klien (skip jika klien tidak punya akun/email).
2. Memilih template berdasarkan `toStatus` (hanya `selesai` di v1) atau `documentCategory`.
3. Memanggil `sendEmail` (sudah ada di `lib/email.ts` dengan `Mailer` injectable).
4. Best-effort: tulis log ke `notificationLog` (tabel baru) tapi JANGAN gagalkan aksi utama jika email gagal.

Hook dipasang di akhir `changeProjectStatus` (saat `toStatus === "selesai"`) dan `shareDocument` (aksi yang menandai dokumen visible-to-client — lihat acceptance di PRD §3 Feature 4).

**Tech Stack:** next-safe-action, Drizzle, Resend (sudah ada), Vitest, pgEnum baru untuk `notificationKind`.

## Global Constraints

- Bahasa email: **Indonesia**. Subjek ringkas, body 3-6 baris + tautan.
- Selalu gunakan `sendEmail` (jangan panggil Resend langsung) — supaya test bisa menyuntikkan `Mailer` palsu.
- Notifikasi TIDAK memblokir alur utama. Tulis ke `notificationLog` setelah `await sendEmail`; jika `sendEmail` throw, catat di log dengan `status: "failed"` dan tetap return success ke caller.
- Tabel `notificationLog` baru — bukan enum di `projects` atau `documents`.
- v1: hanya 2 jenis event (`project_selesai`, `document_shared`). Tambah jenis lain dengan task terpisah.
- Lint/format: `npm run lint:fix`. Typecheck: `npm run typecheck`. Test: `npm test`.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `drizzle/migrations/NNNN_notification_log.sql` (generate) | Tabel `notification_log` + enum `notification_kind`. |
| `lib/db/schema.ts` (modify) | Tambah tabel & enum. |
| `lib/notifications/client-notifier.ts` (create) | Fungsi `notifyStatusChange`, `notifyDocumentShared`. |
| `lib/notifications/client-notifier.test.ts` (create) | Unit test dengan `Mailer` palsu. |
| `lib/notifications/templates.ts` (create) | Template subject + body string, pure function. |
| `lib/notifications/templates.test.ts` (create) | Snapshot-ish test untuk output string. |
| `lib/actions/projects.ts` (modify) | Panggil notifier setelah `changeProjectStatus` (jika `toStatus === "selesai"`). |
| `lib/actions/projects.test.ts` (modify) | Test: notifier terpanggil dengan arg benar. |
| `lib/actions/documents.ts` (modify) | Panggil notifier setelah aksi share (lihat `shareDocument` yang sudah ada). |
| `lib/actions/documents.test.ts` (modify) | Test: share → email terkirim. |

---

### Task 1: Skema DB

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Generate migration**

```ts
// Tambah di lib/db/schema.ts
export const notificationKind = pgEnum("notification_kind", [
  "project_selesai",
  "document_shared",
]);

export const notificationLog = pgTable("notification_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id),
  kind: notificationKind("kind").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull(), // "sent" | "failed" | "skipped_no_email"
  errorMessage: text("error_message"),
  relatedProjectId: uuid("related_project_id").references(() => projects.id, { onDelete: "set null" }),
  relatedDocumentId: uuid("related_document_id").references(() => documents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("notification_log_user_idx").on(t.userId, t.createdAt),
]);
```

- [ ] **Step 2: Generate + migrate**

```bash
npm run db:generate
npm run db:migrate
```

- [ ] **Step 3: Commit**

```bash
git add drizzle/ lib/db/schema.ts
git commit -m "feat(db): add notification_log table"
```

---

### Task 2: Templates

**Files:**
- Create: `lib/notifications/templates.ts`
- Create: `lib/notifications/templates.test.ts`

**Interfaces:**
- `statusChangeTemplate(input: { clientName: string; projectTitle: string; toStatus: ProjectStatus; portalUrl: string }): { subject: string; text: string } | null` — return `null` jika `toStatus` tidak relevan.
- `documentSharedTemplate(input: { clientName: string; projectTitle: string; fileName: string; category: DocumentCategory; portalUrl: string }): { subject: string; text: string }`.

- [ ] **Step 1: Tulis test berisi cuplikan subjek yang diharapkan**

```ts
it("statusChangeTemplate: selesai", () => {
  const t = statusChangeTemplate({
    clientName: "Budi",
    projectTitle: "Survey Kavling A",
    toStatus: "selesai",
    portalUrl: "https://hub.pkp.co.id/portal/projects/abc",
  });
  expect(t?.subject).toMatch(/Selesai/i);
  expect(t?.text).toContain("Budi");
  expect(t?.text).toContain("Survey Kavling A");
  expect(t?.text).toContain("https://hub.pkp.co.id/portal/projects/abc");
});

it("statusChangeTemplate: dijadwalkan return null", () => {
  expect(statusChangeTemplate({ ..., toStatus: "dijadwalkan" })).toBeNull();
});
```

- [ ] **Step 2: Implementasi**

Template body:
- Baris 1: "Halo {clientName},"
- Baris 2-3: kalimat pembuka sesuai kind.
- Baris tengah: judul proyek + tautan.
- Penutup: "Salam, Tim PKP".

- [ ] **Step 3: Test + commit**

```bash
npm test -- lib/notifications/templates.test.ts
git add lib/notifications/templates.ts lib/notifications/templates.test.ts
git commit -m "feat(notifications): email templates for status & document events"
```

---

### Task 3: Notifier

**Files:**
- Create: `lib/notifications/client-notifier.ts`
- Create: `lib/notifications/client-notifier.test.ts`

**Interfaces:**
- `createClientNotifier(deps: { mailer: Mailer; portalBaseUrl: string }): { notifyStatusChange(input), notifyDocumentShared(input) }`
- Fungsi menerima `{ projectId, actorId, toStatus, documentId? }`; load klien + email dari DB; skip jika tidak ada user klien; panggil `sendEmail`; tulis `notification_log`.

- [ ] **Step 1: Tulis test dengan Mailer palsu**

```ts
const sent: EmailMessage[] = [];
const mailer: Mailer = async (m) => { sent.push(m); };
const notifier = createClientNotifier({ mailer, portalBaseUrl: "https://h.test" });

await notifier.notifyStatusChange({ projectId, actorId, toStatus: "selesai" });
expect(sent).toHaveLength(1);
expect(sent[0].to).toBe(clients[0].email);
```

Tambah test: proyek tanpa klien (`clientId` null) → 0 email. Proyek klien tanpa email → tulis log `skipped_no_email`.

- [ ] **Step 2: Implementasi**

```ts
export function createClientNotifier({ mailer, portalBaseUrl }: { mailer: Mailer; portalBaseUrl: string }) {
  async function notifyStatusChange({ projectId, actorId, toStatus }: { projectId: string; actorId: string; toStatus: ProjectStatus }) {
    const tpl = statusChangeTemplate(...);
    if (!tpl) return;
    const { project, client } = await loadProjectAndClient(projectId);
    if (!client?.email) {
      await db.insert(notificationLog).values({ userId: actorId, kind: "project_selesai", subject: tpl.subject, status: "skipped_no_email", relatedProjectId: projectId });
      return;
    }
    try {
      await mailer({ to: client.email, subject: tpl.subject, text: tpl.text });
      await db.insert(notificationLog).values({ userId: client.userId ?? actorId, kind: "project_selesai", subject: tpl.subject, status: "sent", relatedProjectId: projectId });
    } catch (e) {
      await db.insert(notificationLog).values({ ..., status: "failed", errorMessage: String(e) });
    }
  }
  // notifyDocumentShared serupa
  return { notifyStatusChange, notifyDocumentShared };
}
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- lib/notifications/client-notifier.test.ts
git add lib/notifications/client-notifier.ts lib/notifications/client-notifier.test.ts
git commit -m "feat(notifications): client notifier with best-effort logging"
```

---

### Task 4: Wire ke server actions

**Files:**
- Modify: `lib/actions/projects.ts`
- Modify: `lib/actions/documents.ts`

- [ ] **Step 1: Notifier singleton di module**

```ts
// lib/notifications/index.ts
import { sendEmail } from "@/lib/email";
import { env } from "@/env";
import { createClientNotifier } from "./client-notifier";

export const clientNotifier = createClientNotifier({
  mailer: sendEmail,
  portalBaseUrl: env.NEXT_PUBLIC_APP_URL,
});
```

- [ ] **Step 2: Hook di `changeProjectStatus`**

Setelah `changeProjectStatusForUser` sukses, jika `result.project.status === "selesai"`, `await clientNotifier.notifyStatusChange({ projectId, actorId: ctx.rbac.user.id, toStatus: "selesai" })`. Jangan await? TIDAK — await, tapi bungkus `try/catch` agar error notifikasi tidak memblokir return value.

- [ ] **Step 3: Hook di `shareDocument`**

Setelah dokumen ditandai visible-to-client, panggil `notifyDocumentShared`. (Cek nama aksi share di `lib/actions/documents.ts`; bisa jadi `shareDocument` atau `updateDocument`.)

- [ ] **Step 4: Test integrasi + commit**

```bash
npm test -- lib/actions/projects.test.ts lib/actions/documents.test.ts
git add lib/notifications/index.ts lib/actions/projects.ts lib/actions/documents.ts
git commit -m "feat(actions): trigger client notifications on status and document events"
```

---

### Task 5: E2E + manual QA

- [ ] `e2e/notifications.spec.ts`: buat proyek, assign klien dengan email, ubah status ke `selesai`, intercept `sendEmail` di server (atau pakai test mode Resend), assert 1 email terkirim.
- [ ] Cek dashboard owner: tidak ada regresi (aksi tetap return success meski email gagal).

---

## Acceptance Criteria

- [ ] Klien dengan email menerima notifikasi saat proyek `selesai` atau dokumen di-share.
- [ ] Kegagalan email tidak menggagalkan aksi; tercatat di `notification_log.status = "failed"`.
- [ ] Klien tanpa email / tanpa user account: tercatat `skipped_no_email`, 0 email terkirim.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e` (filtered) bersih.
