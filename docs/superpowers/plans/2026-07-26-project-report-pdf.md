# One-Click Project Report PDF Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tombol "Kirim Laporan ke Klien" di `/dashboard/projects/[id]` yang menghasilkan PDF A4: kop studio, metadata proyek, status badge, ringkasan pembayaran dalam rupiah + terbilangnya, daftar dokumen yang di-share, dan snapshot peta. Owner saat ini merangkai ini manual di Drive — fitur ini menggantikan 80% alur itu.

**Architecture:** Action baru `buildProjectReport(projectId)` (server) yang:
1. Mengumpulkan data via Drizzle (proyek, klien, status log, dokumen visible, pembayaran).
2. Render snapshot peta dari `peta-map.tsx` lewat `html-to-image` (sudah ada di deps? cek; kalau tidak, pakai `leaflet-image` + headless render) → PNG. Alternatif lebih sederhana: tampilkan koordinat centroid + 4 titik bounding + daftar layer dalam PDF (tanpa peta raster). **Mulai dari alternatif sederhana di v1.**
3. Panggil `buildReportPdf` (sudah ada di `lib/export/pdf.ts`) dengan `ReportDefinition` baru.
4. Return `Uint8Array`; route POST ke `app/api/projects/[id]/report/route.ts` mengembalikan `application/pdf` dengan `Content-Disposition: attachment`.

Trigger dari UI: tombol di `components/projects/project-summary.tsx`.

**Tech Stack:** pdf-lib (sudah), Drizzle, next-safe-action, Next.js Route Handler untuk stream PDF.

## Global Constraints

- Bahasa PDF: **Indonesia** (label, header tabel). Angka: format `formatRupiah` yang sudah ada di `lib/format.ts`.
- `terbilang.ts` dipakai untuk "Terbilang: ..." di footer bagian pembayaran.
- v1: TANPA raster peta (cukup centroid + bounding box + daftar layer). Snapshot raster jadi task lanjutan.
- File output: `Laporan-<nomorProyek>-<judul-slug>.pdf`. Karakter non-ASCII di-slug.
- RBAC: admin selalu boleh; surveyor hanya untuk proyek assigned; klien TIDAK boleh unduh via endpoint ini (pakai `client.read` saja di portal).
- Lint/format: `npm run lint:fix`. Typecheck: `npm run typecheck`. Test: `npm test`.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `lib/export/reports/project-report.ts` (create) | Definisi `projectReportDefinition` (`ReportDefinition<ProjectReportRow>`) + helper `projectReportRowsFor(project)`. |
| `lib/export/reports/project-report.test.ts` (create) | Unit test: rows yang dihasilkan, format rupiah + terbilang. |
| `lib/actions/project-report.ts` (create) | Server action `buildProjectReportForUser(ctx, projectId): Promise<Uint8Array>`. |
| `lib/actions/project-report.test.ts` (create) | Test scoping: admin vs surveyor. |
| `app/api/projects/[id]/report/route.ts` (create) | GET/POST: auth, panggil action, stream PDF. |
| `components/projects/report-download-button.tsx` (create) | Tombol "Unduh Laporan PDF" — `<a href>` langsung ke endpoint, atau panggil action dan trigger download di klien. |
| `components/projects/project-summary.tsx` (modify) | Mount tombol. |
| `lib/export/types.ts` (modify, jika perlu) | Tambah `HeaderSection` (kop) atau reuse yang ada. |

---

### Task 1: Report definition + rows

**Files:**
- Create: `lib/export/reports/project-report.ts`
- Create: `lib/export/reports/project-report.test.ts`

**Interfaces:**
- `projectReportDefinition: ReportDefinition<ProjectReportRow>` dengan `title`, `columns`, dan `meta` (kop, footer).
- `ProjectReportRow` adalah union: baris metadata + baris tabel. Atau gunakan struktur bersarang: laporan ini punya 3 bagian (info, pembayaran, dokumen). `buildReportPdf` saat ini expect tabel; cek apakah bisa di-extend. **Jika tidak**, plan ini menulis helper `buildProjectReportPdf(...)` khusus yang memanggil PDFDocument secara langsung dengan layout multi-section.

- [ ] **Step 1: Tulis test**

```ts
it("menghasilkan baris yang diformat dengan rupiah + terbilang", () => {
  const rows = projectReportRowsFor({ project: { valueIdr: 15_000_000, ... }, client: { name: "Budi" } });
  expect(rows.docs).toContainEqual(expect.objectContaining({ name: expect.any(String) }));
  expect(rows.feeText).toMatch(/lima belas juta/); // dari terbilang
});
```

- [ ] **Step 2: Implementasi**

```ts
export function projectReportRowsFor(input: { project: ProjectWithRelations; client: Client; payments: Payment[]; documents: Document[] }) {
  const totalPaid = input.payments.reduce((s, p) => s + Number(p.amountIdr), 0);
  return {
    feeIdr: input.project.valueIdr,
    feeText: `Terbilang: ${terbilang(input.project.valueIdr)} rupiah`,
    totalPaidText: `Terbilang: ${terbilang(totalPaid)} rupiah`,
    docs: input.documents.filter(d => d.visibleToClient).map((d) => ({ ...d, uploadedAt: d.createdAt })),
  };
}
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- lib/export/reports/project-report.test.ts
git add lib/export/reports/project-report.ts lib/export/reports/project-report.test.ts
git commit -m "feat(report): project report row builder"
```

---

### Task 2: Server action + scope

**Files:**
- Create: `lib/actions/project-report.ts`
- Create: `lib/actions/project-report.test.ts`

**Interfaces:**
- `buildProjectReportForUser(ctx: RbacContext, projectId: string): Promise<Uint8Array>`
- Permission: `report.generate` (cek resource `report` di `lib/rbac/resources/report.ts` — sudah ada, lihat isinya).

- [ ] **Step 1: Action**

```ts
"use server";
import { rbacActionClient } from "./safe-action";
import { buildProjectReportForUser } from "./project-report";

export const generateProjectReport = rbacActionClient
  .metadata({ permission: "report.generate" })
  .inputSchema(z.object({ projectId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const bytes = await buildProjectReportForUser(ctx.rbac, parsedInput.projectId);
    // next-safe-action tidak ideal untuk binary; route handler (Task 3) memanggil logic langsung.
    return { success: true as const, size: bytes.byteLength };
  });
```

Logic `buildProjectReportForUser`:
- Load proyek via `getProjectForUser`-style helper (reuse).
- Throw jika tidak ketemu.
- `projectReportRowsFor(...)`.
- Panggil helper `buildProjectReportPdf` (lihat Task 3 atau tulis inline).

- [ ] **Step 2: Test scoping**

Surveyor non-assigned → throw. Klien → throw (cek resource `report` mana yang di-grant ke role `client`; jika `client` punya `report.generate`, larang di level row).

- [ ] **Step 3: Commit**

```bash
npm test -- lib/actions/project-report.test.ts
git add lib/actions/project-report.ts lib/actions/project-report.test.ts
git commit -m "feat(report): server action for project PDF"
```

---

### Task 3: PDF builder (multi-section)

**Files:**
- Modify atau create: `lib/export/pdf-project.ts` (berdiri sendiri, bukan reuse `buildReportPdf` yang tabular-only)

- [ ] **Step 1: Implementasi builder**

```ts
// lib/export/pdf-project.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { STUDIO } from "@/lib/studio-identity";
import { formatRupiah } from "@/lib/format";

export async function buildProjectReportPdf(input: ProjectReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Kop studio (reuse STUDIO dari lib/studio-identity.ts)
  // Metadata proyek
  // Tabel dokumen visible
  // Bagian pembayaran
  // Footer: "Terbilang: ..." + tanggal生成
  return await pdf.save();
}
```

Detail styling: padding 36pt, font 10pt body / 14pt judul, garis tipis antar section.

- [ ] **Step 2: Test snapshot byte-length + sanity**

```ts
it("menghasilkan PDF minimal 2KB", async () => {
  const bytes = await buildProjectReportPdf(fakeInput);
  expect(bytes.byteLength).toBeGreaterThan(2000);
  // opsional: parse PDF header
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
});
```

- [ ] **Step 3: Commit**

```bash
npm test -- lib/export/pdf-project.test.ts
git add lib/export/pdf-project.ts lib/export/pdf-project.test.ts
git commit -m "feat(report): multi-section project PDF builder"
```

---

### Task 4: Route handler streaming

**Files:**
- Create: `app/api/projects/[id]/report/route.ts`

- [ ] **Step 1: Implementasi**

```ts
import { requireUser } from "@/lib/auth-guards";
import { buildProjectReportForUser } from "@/lib/actions/project-report";
import { getRbacContext } from "@/lib/rbac/context";
import { assertCan } from "@/lib/rbac/can";
import { NextResponse } from "next/server";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role === "client") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rbac = await getRbacContext();
  try { assertCan(rbac, "report.generate"); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const { id } = await ctx.params;
  const bytes = await buildProjectReportForUser(rbac, id);
  return new Response(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="laporan-${id}.pdf"`,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/projects/[id]/report/route.ts
git commit -m "feat(report): GET endpoint streams project PDF"
```

---

### Task 5: UI button

**Files:**
- Create: `components/projects/report-download-button.tsx`
- Modify: `components/projects/project-summary.tsx`

- [ ] **Step 1: Tombol**

```tsx
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportDownloadButton({ projectId }: { projectId: string }) {
  return (
    <Button asChild variant="outline">
      <a href={`/api/projects/${projectId}/report`} target="_blank" rel="noopener">
        <Download /> Unduh Laporan PDF
      </a>
    </Button>
  );
}
```

- [ ] **Step 2: Mount**

Tambah di `project-summary.tsx` di samping tombol share/save. RBAC: hanya tampil jika `permissions.has("report.generate")`.

- [ ] **Step 3: Commit**

```bash
git add components/projects/report-download-button.tsx components/projects/project-summary.tsx
git commit -m "feat(ui): report download button on project page"
```

---

### Task 6: E2E

- [ ] `e2e/project-report.spec.ts`:
  - Login admin, buka proyek seed, klik tombol.
  - Tunggu `response` Playwright; assert `content-type: application/pdf` + byte length > 2KB.
  - Simpan ke disk (opsional) untuk inspeksi visual.

---

## Acceptance Criteria

- [ ] Owner bisa unduh PDF satu klik untuk proyek manapun.
- [ ] Surveyor hanya untuk proyek assigned.
- [ ] Klien TIDAK punya akses ke endpoint (403).
- [ ] PDF berisi: kop studio, metadata, status, fee + terbilang, daftar dokumen visible, ringkasan pembayaran.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e` (filtered) bersih.

## Future Work (di luar plan ini)

- Snapshot raster peta (perlu `leaflet-image` atau headless render di server).
- Tanda tangan digital owner (perlu signature asset).
- Multi-bahasa (Inggris untuk klien ekspatriat).
