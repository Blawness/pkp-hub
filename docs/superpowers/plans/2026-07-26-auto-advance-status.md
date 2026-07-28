# Auto-Advance Project Status from Field Events — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memindahkan `projectStatus` dari `baru` → `data_diambil` secara otomatis saat surveyor berhasil mengimpor layer CSV atau mengunggah dokumen pertama dengan kategori `foto_lapangan` — agar dashboard owner merefleksikan realita lapangan tanpa langkah manual tambahan.

**Architecture:** Hook tipis di akhir dua aksi yang sudah ada — `importMapCsv` (di `lib/actions/maps.ts`) dan aksi upload dokumen dengan kategori `foto_lapangan` (di `lib/actions/documents.ts`). Hook membaca `currentStatus`; jika `baru`, panggil helper `maybeAdvanceToDataDiambil(projectId, actorRbac)` yang:
1. Mengecek izin pemanggil (siapa pun dengan `map.write` atau `document.write` di proyek tsb boleh memicu).
2. Menulis `projectStatusLogs` row (satu baris `system` actor atau actor sebenarnya? lihat Task 2).
3. Update `projects.status` ke `data_diambil`.
4. `revalidatePath` ke `/dashboard/projects` dan detail.

Hanya maju SATU langkah (tidak loncat ke `diproses`). Mundur (data batal) tetap manual.

**Tech Stack:** next-safe-action, Drizzle, Vitest. Tidak ada dependensi baru.

## Global Constraints

- Hanya maju dari `baru` ke `data_diambil` — tidak ada auto-advance berantai.
- Tidak auto-mundur. Jika admin ingin kembali ke `baru`, pakai `changeProjectStatus` seperti biasa.
- `projectStatusLogs` harus punya `actorId` yang valid; untuk auto-advance, pakai `userId` pemanggil (bukan `null`), dan `note` berisi sumber ("Otomatis: impor CSV" / "Otomatis: unggah foto lapangan").
- Transaksi DB tunggal untuk update status + insert log.
- Lint/format: `npm run lint:fix`. Typecheck: `npm run typecheck`. Test: `npm test`.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `lib/actions/status-auto-advance.ts` (create) | Helper `maybeAdvanceToDataDiambil(tx, projectId, actorId, reason)`. |
| `lib/actions/status-auto-advance.test.ts` (create) | Unit test: maju hanya dari `baru`, idempotent, tulis log. |
| `lib/actions/maps.ts` (modify) | Panggil helper setelah `importMapCsvForUser` sukses. |
| `lib/actions/maps.test.ts` (modify) | Tambah test: impor CSV di proyek `baru` → status jadi `data_diambil`. |
| `lib/actions/documents.ts` (modify) | Panggil helper setelah `createDocumentForUser` sukses jika kategori `foto_lapangan`. |
| `lib/actions/documents.test.ts` (modify) | Tambah test: upload foto lapangan di proyek `baru` → status maju. |
| `lib/actions/projects-logic.ts` (modify) | Ekspor helper `getProjectStatusForUpdate` (atau reuse `changeProjectStatusForUser` — pilih yang lebih DRY). |

---

### Task 1: Helper `maybeAdvanceToDataDiambil`

**Files:**
- Create: `lib/actions/status-auto-advance.ts`
- Create: `lib/actions/status-auto-advance.test.ts`

**Interfaces:**
- `maybeAdvanceToDataDiambil({ projectId, actorId, reason }: { projectId: string; actorId: string; reason: "import_csv" | "upload_foto_lapangan" }): Promise<{ advanced: boolean; from: ProjectStatus | null; to: ProjectStatus | null }>`
- Mengembalikan `advanced: false` jika status bukan `baru` atau sudah `data_diambil` (idempotent).

- [ ] **Step 1: Tulis test gagal**

```ts
// lib/actions/status-auto-advance.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, projectStatusLogs } from "@/lib/db/schema";
import { maybeAdvanceToDataDiambil } from "./status-auto-advance";

describe("maybeAdvanceToDataDiambil", () => {
  let projectId: string;
  let actorId: string;

  beforeEach(async () => {
    // Seed satu proyek baru + satu user; pakai helper seed proyek yang sudah ada
  });

  afterEach(async () => {
    await db.delete(projectStatusLogs).where(eq(projectStatusLogs.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
  });

  it("maju dari baru ke data_diambil dan menulis log", async () => {
    const result = await maybeAdvanceToDataDiambil({ projectId, actorId, reason: "import_csv" });
    expect(result).toEqual({ advanced: true, from: "baru", to: "data_diambil" });

    const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(row.status).toBe("data_diambil");

    const logs = await db.select().from(projectStatusLogs).where(eq(projectStatusLogs.projectId, projectId));
    expect(logs).toHaveLength(1);
    expect(logs[0].fromStatus).toBe("baru");
    expect(logs[0].toStatus).toBe("data_diambil");
    expect(logs[0].note).toMatch(/CSV/);
  });

  it("tidak menulis log jika status sudah data_diambil (idempotent)", async () => {
    await db.update(projects).set({ status: "data_diambil" }).where(eq(projects.id, projectId));
    const result = await maybeAdvanceToDataDiambil({ projectId, actorId, reason: "import_csv" });
    expect(result.advanced).toBe(false);
  });

  it("tidak mundur dari diproses/selesai", async () => {
    await db.update(projects).set({ status: "diproses" }).where(eq(projects.id, projectId));
    const result = await maybeAdvanceToDataDiambil({ projectId, actorId, reason: "upload_foto_lapangan" });
    expect(result.advanced).toBe(false);
  });
});
```

- [ ] **Step 2: Implementasi minimal**

```ts
// lib/actions/status-auto-advance.ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { type ProjectStatus, projects, projectStatusLogs } from "@/lib/db/schema";

type Reason = "import_csv" | "upload_foto_lapangan";

const REASON_NOTE: Record<Reason, string> = {
  import_csv: "Otomatis: impor CSV koordinat",
  upload_foto_lapangan: "Otomatis: unggah foto lapangan pertama",
};

export async function maybeAdvanceToDataDiambil({
  projectId,
  actorId,
  reason,
}: {
  projectId: string;
  actorId: string;
  reason: Reason;
}) {
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    if (!row) throw new Error(`Proyek ${projectId} tidak ditemukan.`);
    if (row.status !== "baru") return { advanced: false as const, from: null, to: null };

    const now = new Date();
    await tx
      .update(projects)
      .set({ status: "data_diambil", updatedAt: now })
      .where(eq(projects.id, projectId));
    await tx.insert(projectStatusLogs).values({
      projectId,
      fromStatus: "baru" satisfies ProjectStatus,
      toStatus: "data_diambil" satisfies ProjectStatus,
      changedById: actorId,
      note: REASON_NOTE[reason],
    });
    return { advanced: true as const, from: "baru" as const, to: "data_diambil" as const };
  });
}
```

- [ ] **Step 3: Run test**

```bash
npm test -- lib/actions/status-auto-advance.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add lib/actions/status-auto-advance.ts lib/actions/status-auto-advance.test.ts
git commit -m "feat(status): helper to auto-advance baru→data_diambil on field events"
```

---

### Task 2: Wire ke `importMapCsv`

**Files:**
- Modify: `lib/actions/maps.ts`
- Modify: `lib/actions/maps.test.ts`

- [ ] **Step 1: Modifikasi action**

```ts
// lib/actions/maps.ts (tambah)
import { maybeAdvanceToDataDiambil } from "./status-auto-advance";
// ... di dalam .action(async ({ parsedInput, ctx }) => { ... })
const result = await importMapCsvForUser(ctx.rbac, parsedInput);
const advance = await maybeAdvanceToDataDiambil({
  projectId: parsedInput.projectId,
  actorId: ctx.rbac.user.id,
  reason: "import_csv",
});
revalidatePath("/dashboard/projects");
revalidatePath(`/dashboard/projects/${parsedInput.projectId}`);
return { success: true as const, ...result, statusAdvanced: advance.advanced };
```

- [ ] **Step 2: Tambah test integrasi**

Di `maps.test.ts`, tambah satu test: buat proyek `baru`, panggil `importMapCsv` (sudah ada helper di test), assert `projects.status === "data_diambil"` dan `projectStatusLogs` punya 1 entry.

- [ ] **Step 3: Run test**

```bash
npm test -- lib/actions/maps.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add lib/actions/maps.ts lib/actions/maps.test.ts
git commit -m "feat(maps): auto-advance project status on CSV import"
```

---

### Task 3: Wire ke upload foto lapangan

**Files:**
- Modify: `lib/actions/documents.ts`
- Modify: `lib/actions/documents.test.ts`

- [ ] **Step 1: Modifikasi action upload**

Cari `createDocumentAction` (atau nama serupa) di `lib/actions/documents.ts`. Setelah insert berhasil dan `parsedInput.category === "foto_lapangan"`, panggil `maybeAdvanceToDataDiambil`. Pengecekan `category` SEBELUM helper (hemat query).

- [ ] **Step 2: Tambah test integrasi**

Test: proyek `baru` + upload dokumen kategori `laporan` → status tetap `baru`. Upload `foto_lapangan` → status `data_diambil`.

- [ ] **Step 3: Run + commit**

```bash
npm test -- lib/actions/documents.test.ts
git add lib/actions/documents.ts lib/actions/documents.test.ts
git commit -m "feat(documents): auto-advance project status on first foto_lapangan upload"
```

---

### Task 4: Manual QA

- [ ] Login sebagai surveyor, buka proyek `baru`, impor CSV → cek status badge di UI.
- [ ] Cek `projectStatusLogs` di DB: 1 baris dengan `note` berisi "impor CSV".
- [ ] Login admin, set proyek ke `diproses` manual, lalu impor CSV lagi → status TIDAK mundur atau berubah.

---

## Acceptance Criteria

- [ ] Surveyor tidak perlu klik tombol "Data Diambil" lagi setelah impor CSV / upload foto lapangan pertama.
- [ ] `projectStatusLogs` punya jejak untuk setiap auto-advance (bukan silent change).
- [ ] Tidak ada regresi: proyek yang sudah `diproses`/`selesai`/`dibatalkan` tidak ter-reset.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` bersih.
