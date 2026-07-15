# Perbaikan UX/UI Alur Proyek — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bikin halaman detail proyek langsung menampilkan "proyek ini lagi di mana" lewat panel ringkasan yang selalu tampil, dan ubah status jadi pipeline visual dengan aksi maju satu klik.

**Architecture:** Dua komponen baru — `status-pipeline.tsx` (client) menggantikan `status-changer.tsx`, dan `project-summary.tsx` (server) menggantikan seluruh tab Overview — plus satu wrapper dialog kecil `surveyor-assign-dialog.tsx`. `page.tsx` merender panel di atas `Tabs` dan menghapus tab Overview. Nol perubahan server action / auth guard / transition table.

**Tech Stack:** Next.js (App Router, RSC), React client islands, next-safe-action, Radix (Dialog + DropdownMenu via `components/ui/`), Tailwind v4.

## Global Constraints

- **Tidak menyentuh** `getAllowedNextStatuses`, `FORWARD_CHAIN`, `changeProjectStatusForUser`, `assignSurveyorForUser`, atau schema/DB. Murni UI.
- **Tidak menambah dependency/komponen UI baru.** Pakai `dialog`, `dropdown-menu`, `badge`, `button` yang sudah ada; bar progres & disclosure dari elemen HTML biasa.
- **Sumber urutan pipeline** = `projectStatusEnum.options` tanpa `"dibatalkan"` (client-safe, dari `lib/actions/projects-schemas.ts`). Jangan hardcode array status baru; jangan impor `projects-logic.ts` ke client (menarik kode server ke bundle).
- **Aksi status**: "Lanjut" satu klik tanpa konfirmasi; "Batalkan proyek" & "Aktifkan lagi" wajib dialog konfirmasi; "Mundur satu tahap" langsung tanpa konfirmasi. Menu ⋯ hanya admin.
- Semua teks UI Bahasa Indonesia, konsisten label dari `lib/labels.ts` (`statusLabel`).
- Verifikasi wajib hijau di akhir: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, dan `pnpm e2e` (butuh `pnpm dev` jalan).

> **Catatan metode uji:** Repo ini tidak punya infra test komponen React (vitest `environment: "node"`, hit DB nyata; UI diuji lewat Playwright `e2e/`). Karena tiga tugas pertama murni client UI tanpa logika server baru, gerbang tiap tugas = `pnpm typecheck` + `pnpm lint` (harus lolos). Verifikasi perilaku end-to-end ada di Task 4 (e2e + cek manual di browser). Tidak ada test vitest baru — tak ada logika server yang berubah.

## File Structure

| File | Aksi | Tanggung jawab |
|---|---|---|
| `components/projects/status-pipeline.tsx` | Create | Stepper visual + tombol "Lanjut" + menu ⋯ (admin) + dialog konfirmasi + toggle riwayat |
| `components/projects/surveyor-assign-dialog.tsx` | Create | Tombol "Ubah" (admin) yang membuka `AssignSurveyorForm` di dalam `Dialog` |
| `components/projects/project-summary.tsx` | Create | Panel ringkasan: judul, pipeline, progres, surveyor, sisa bayar, disclosure detail |
| `components/projects/status-changer.tsx` | Delete | Digantikan `status-pipeline.tsx` |
| `app/dashboard/projects/[id]/page.tsx` | Modify | Render panel di atas Tabs; hapus tab Overview; `defaultValue="fase"` |

---

### Task 1: Komponen `StatusPipeline` (ganti `StatusChanger`)

**Files:**
- Create: `components/projects/status-pipeline.tsx`
- Delete: `components/projects/status-changer.tsx`
- Reference: `components/dashboard/user-menu.tsx` (pola DropdownMenu), `components/projects/phase-form-dialog.tsx` (pola Dialog), `components/projects/status-changer.tsx` (perilaku lama yang diganti)

**Interfaces:**
- Consumes: `changeProjectStatus` (`lib/actions/projects.ts`, input `{ projectId, toStatus }`), `projectStatusEnum` (`lib/actions/projects-schemas.ts`), `StatusHistory` + `StatusLogRow` (`components/projects/status-history.tsx`), `statusLabel` (`lib/labels.ts`), `StatusBadge` (`components/projects/status-badge.tsx`).
- Produces: `StatusPipeline` React component with props:
  ```ts
  {
    projectId: string;
    currentStatus: string;
    allowedNextStatuses: string[];
    isAdmin: boolean;
    logs: StatusLogRow[];
  }
  ```

- [ ] **Step 1: Konfirmasi tidak ada pemakai lain dari `StatusChanger`**

Run: `grep -rn "StatusChanger\|status-changer" components app lib e2e --include="*.ts" --include="*.tsx"`
Expected: hanya `app/dashboard/projects/[id]/page.tsx` (import + pemakaian) dan file `status-changer.tsx` sendiri. Kalau ada pemakai lain, hentikan dan laporkan.

- [ ] **Step 2: Tulis `components/projects/status-pipeline.tsx`**

```tsx
"use client";

import { CheckIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { StatusBadge } from "@/components/projects/status-badge";
import { StatusHistory, type StatusLogRow } from "@/components/projects/status-history";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { changeProjectStatus } from "@/lib/actions/projects";
import { projectStatusEnum } from "@/lib/actions/projects-schemas";
import { statusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

type ProjectStatus = (typeof projectStatusEnum.options)[number];

// Urutan tampilan pipeline = enum tanpa "dibatalkan" (status terminal di luar
// rantai maju). Ini metadata TAMPILAN saja; tabel transisi resmi tetap
// satu-satunya di `projects-logic.ts` (FORWARD_CHAIN) — jangan duplikasi
// logikanya, dan JANGAN impor file itu ke sini (kode server).
const PIPELINE = projectStatusEnum.options.filter((s) => s !== "dibatalkan");

/**
 * Menggantikan `status-changer.tsx`. Stepper visual + aksi status. Server tetap
 * satu-satunya penegak transisi (`changeProjectStatusForUser`); `allowedNextStatuses`
 * di sini hanya UX. Menu ⋯ (mundur/batalkan/aktifkan lagi) hanya untuk admin.
 */
export function StatusPipeline({
  projectId,
  currentStatus,
  allowedNextStatuses,
  isAdmin,
  logs,
}: {
  projectId: string;
  currentStatus: string;
  allowedNextStatuses: string[];
  isAdmin: boolean;
  logs: StatusLogRow[];
}) {
  const router = useRouter();
  const { executeAsync, isExecuting } = useAction(changeProjectStatus);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Aksi destruktif menunggu konfirmasi; simpan target di sini (null = tertutup).
  const [confirm, setConfirm] = useState<{ toStatus: ProjectStatus; label: string } | null>(null);

  const isCancelled = currentStatus === "dibatalkan";
  const currentIdx = PIPELINE.indexOf(currentStatus);

  const forwardStatus =
    currentIdx !== -1 && currentIdx + 1 < PIPELINE.length ? PIPELINE[currentIdx + 1] : null;
  const canForward = forwardStatus !== null && allowedNextStatuses.includes(forwardStatus);

  const backwardStatus =
    currentIdx > 0 && allowedNextStatuses.includes(PIPELINE[currentIdx - 1])
      ? PIPELINE[currentIdx - 1]
      : null;
  const canCancel = allowedNextStatuses.includes("dibatalkan");
  const canReactivate = isCancelled && allowedNextStatuses.includes("baru");
  const hasMenu = isAdmin && (backwardStatus !== null || canCancel || canReactivate);

  async function run(toStatus: ProjectStatus) {
    setError(null);
    const result = await executeAsync({ projectId, toStatus });
    if (result?.serverError) {
      setError(result.serverError);
      return false;
    }
    router.refresh();
    return true;
  }

  const noActions = !canForward && !hasMenu;

  return (
    <div className="flex flex-col gap-3">
      {/* Stepper */}
      <ol className="flex items-center gap-1 overflow-x-auto overflow-y-hidden pb-1">
        {PIPELINE.map((status, i) => {
          const done = currentIdx !== -1 && i < currentIdx;
          const current = i === currentIdx;
          return (
            <li key={status} className="flex shrink-0 items-center gap-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
                  current && "bg-primary text-primary-foreground",
                  done && "bg-primary/15 text-foreground",
                  !current && !done && "bg-muted text-muted-foreground",
                  isCancelled && "opacity-40",
                )}
              >
                {done ? <CheckIcon className="size-3" /> : null}
                {statusLabel[status] ?? status}
              </span>
              {i < PIPELINE.length - 1 ? (
                <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/40" />
              ) : null}
            </li>
          );
        })}
        {isCancelled ? (
          <li className="shrink-0 pl-2">
            <StatusBadge status="dibatalkan" />
          </li>
        ) : null}
      </ol>

      {/* Aksi */}
      <div className="flex flex-wrap items-center gap-2">
        {canForward && forwardStatus ? (
          <Button
            size="sm"
            disabled={isExecuting}
            onClick={() => run(forwardStatus)}
          >
            {isExecuting ? "Menyimpan…" : `Lanjut ke: ${statusLabel[forwardStatus] ?? forwardStatus} →`}
          </Button>
        ) : null}

        {hasMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Aksi status lain" disabled={isExecuting}>
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {backwardStatus ? (
                <DropdownMenuItem onSelect={() => run(backwardStatus)}>
                  Mundur ke {statusLabel[backwardStatus] ?? backwardStatus}
                </DropdownMenuItem>
              ) : null}
              {canReactivate ? (
                <DropdownMenuItem
                  onSelect={() => setConfirm({ toStatus: "baru", label: "Aktifkan lagi proyek" })}
                >
                  Aktifkan lagi
                </DropdownMenuItem>
              ) : null}
              {canCancel ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirm({ toStatus: "dibatalkan", label: "Batalkan proyek" })}
                >
                  Batalkan proyek
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {noActions ? (
          <p className="text-sm text-muted-foreground">
            {currentStatus === "selesai"
              ? "Proyek selesai."
              : "Tidak ada transisi status yang tersedia untuk peran Anda saat ini."}
          </p>
        ) : null}

        <button
          type="button"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? "Sembunyikan riwayat" : "Riwayat"}
        </button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {showHistory ? (
        <div className="rounded-md border p-3">
          <StatusHistory logs={logs} />
        </div>
      ) : null}

      {/* Konfirmasi aksi destruktif */}
      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.label}</DialogTitle>
            <DialogDescription>
              {confirm?.toStatus === "dibatalkan"
                ? "Proyek akan ditandai dibatalkan. Kamu tetap bisa mengaktifkannya lagi nanti."
                : "Proyek yang dibatalkan akan dikembalikan ke status Baru."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)} disabled={isExecuting}>
              Batal
            </Button>
            <Button
              size="sm"
              variant={confirm?.toStatus === "dibatalkan" ? "destructive" : "default"}
              disabled={isExecuting}
              onClick={async () => {
                if (!confirm) return;
                const ok = await run(confirm.toStatus);
                if (ok) setConfirm(null);
              }}
            >
              {isExecuting ? "Menyimpan…" : "Ya, lanjut"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Verifikasi `Button` mendukung `variant="destructive"` dan `DropdownMenuItem` mendukung `variant="destructive"`**

Run: `grep -n "destructive" components/ui/button.tsx components/ui/dropdown-menu.tsx`
Expected: kedua file punya varian `destructive`. Jika `DropdownMenuItem` TIDAK punya prop `variant`, hapus `variant="destructive"` dari item "Batalkan proyek" (biarkan teks saja) — jangan tambah varian baru.

- [ ] **Step 4: Hapus komponen lama**

```bash
git rm components/projects/status-changer.tsx
```

(Import di `page.tsx` masih menunjuk ke file ini — akan diperbaiki di Task 3. `pnpm typecheck` sengaja belum hijau sampai Task 3 selesai; itu diharapkan.)

- [ ] **Step 5: Lint file baru saja**

Run: `pnpm biome check components/projects/status-pipeline.tsx`
Expected: no errors (atau autofix-able; jalankan `pnpm biome check --write components/projects/status-pipeline.tsx` bila perlu).

- [ ] **Step 6: Commit**

```bash
git add components/projects/status-pipeline.tsx components/projects/status-changer.tsx
git commit -m "feat(proyek): komponen StatusPipeline gantikan StatusChanger"
```

---

### Task 2: Panel ringkasan `ProjectSummary` + dialog assign

**Files:**
- Create: `components/projects/surveyor-assign-dialog.tsx`
- Create: `components/projects/project-summary.tsx`
- Reference: `components/projects/assign-surveyor-form.tsx`, `components/projects/status-badge.tsx`, `lib/labels.ts`

**Interfaces:**
- Consumes: `StatusPipeline` (Task 1), `AssignSurveyorForm` (`components/projects/assign-surveyor-form.tsx`), `StatusBadge`, `StatusLogRow`, `surveyTypeLabel` + `paymentStatusLabel` (`lib/labels.ts`).
- Produces:
  - `SurveyorAssignDialog` props: `{ projectId: string; currentSurveyorId: string | null; surveyors: { id: string; name: string }[] }`
  - `ProjectSummary` props:
    ```ts
    {
      projectId: string;
      title: string;
      surveyType: string;
      clientId: string | null;
      clientName: string | null;   // null → "Klien tidak ditemukan"
      surveyorName: string;         // "—" bila belum ditugaskan
      assignedSurveyorId: string | null;
      surveyors: { id: string; name: string }[]; // kosong utk non-admin
      isAdmin: boolean;
      canEdit: boolean;             // tombol Edit proyek (admin)
      status: string;
      allowedNextStatuses: string[];
      logs: StatusLogRow[];
      progressPercent: number | null;
      phasesDone: number;
      phasesTotal: number;
      remaining: number | null;     // null → sembunyikan baris bayar
      paymentStatus: string | null; // "belum" | "sebagian" | "lunas" | null
      locationLabel: string | null;
      orderDate: Date;
      description: string | null;
    }
    ```

- [ ] **Step 1: Tulis `components/projects/surveyor-assign-dialog.tsx`**

```tsx
"use client";

import { PencilIcon } from "lucide-react";
import { AssignSurveyorForm } from "@/components/projects/assign-surveyor-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Admin-only: tombol kecil "Ubah" di sebelah nama surveyor → dialog assign. */
export function SurveyorAssignDialog({
  projectId,
  currentSurveyorId,
  surveyors,
}: {
  projectId: string;
  currentSurveyorId: string | null;
  surveyors: { id: string; name: string }[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
          <PencilIcon className="size-3" />
          Ubah
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign surveyor</DialogTitle>
        </DialogHeader>
        <AssignSurveyorForm
          projectId={projectId}
          currentSurveyorId={currentSurveyorId}
          surveyors={surveyors}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Tulis `components/projects/project-summary.tsx`**

```tsx
import Link from "next/link";
import { StatusPipeline } from "@/components/projects/status-pipeline";
import { StatusBadge } from "@/components/projects/status-badge";
import type { StatusLogRow } from "@/components/projects/status-history";
import { SurveyorAssignDialog } from "@/components/projects/surveyor-assign-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { paymentStatusLabel, surveyTypeLabel } from "@/lib/labels";

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/**
 * Panel ringkasan yang menggantikan tab Overview. Selalu tampil di atas tab —
 * memuat info yang paling sering dipantau: status (pipeline), progres fase,
 * surveyor, dan sisa bayar (admin). Detail jarang-lihat disembunyikan di
 * <details>. Server component; interaktivitas ada di island (StatusPipeline,
 * SurveyorAssignDialog).
 */
export function ProjectSummary({
  projectId,
  title,
  surveyType,
  clientId,
  clientName,
  surveyorName,
  assignedSurveyorId,
  surveyors,
  isAdmin,
  canEdit,
  status,
  allowedNextStatuses,
  logs,
  progressPercent,
  phasesDone,
  phasesTotal,
  remaining,
  paymentStatus,
  locationLabel,
  orderDate,
  description,
}: {
  projectId: string;
  title: string;
  surveyType: string;
  clientId: string | null;
  clientName: string | null;
  surveyorName: string;
  assignedSurveyorId: string | null;
  surveyors: { id: string; name: string }[];
  isAdmin: boolean;
  canEdit: boolean;
  status: string;
  allowedNextStatuses: string[];
  logs: StatusLogRow[];
  progressPercent: number | null;
  phasesDone: number;
  phasesTotal: number;
  remaining: number | null;
  paymentStatus: string | null;
  locationLabel: string | null;
  orderDate: Date;
  description: string | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6">
        {/* Baris judul */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium">{title}</h1>
            <p className="text-sm text-muted-foreground">
              {clientName ? (
                clientId ? (
                  <Link href={`/dashboard/clients/${clientId}`} className="hover:underline">
                    {clientName}
                  </Link>
                ) : (
                  clientName
                )
              ) : (
                "Klien tidak ditemukan"
              )}
              {" · "}
              {surveyTypeLabel[surveyType] ?? surveyType}
            </p>
          </div>
          {canEdit ? (
            <ButtonLink variant="outline" size="sm" href={`/dashboard/projects/${projectId}/edit`}>
              Edit
            </ButtonLink>
          ) : null}
        </div>

        {/* Status pipeline */}
        <StatusPipeline
          projectId={projectId}
          currentStatus={status}
          allowedNextStatuses={allowedNextStatuses}
          isAdmin={isAdmin}
          logs={logs}
        />

        {/* Progres + surveyor + bayar */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Progres fase</p>
            {progressPercent === null ? (
              <p className="text-sm text-muted-foreground">Belum ada fase.</p>
            ) : (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {progressPercent}% · {phasesDone} dari {phasesTotal} fase selesai
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Surveyor</p>
            <div className="flex items-center gap-1">
              <span className="text-sm">{surveyorName}</span>
              {isAdmin ? (
                <SurveyorAssignDialog
                  projectId={projectId}
                  currentSurveyorId={assignedSurveyorId}
                  surveyors={surveyors}
                />
              ) : null}
            </div>
          </div>

          {remaining !== null ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">Sisa pembayaran</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{rupiah.format(remaining)}</span>
                {paymentStatus ? <StatusBadge status={paymentStatus} /> : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Detail jarang-lihat */}
        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
            <span className="group-open:hidden">▸ Detail proyek</span>
            <span className="hidden group-open:inline">▾ Detail proyek</span>
          </summary>
          <div className="grid gap-3 pt-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Lokasi</p>
              <p className="text-sm">{locationLabel ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tanggal order</p>
              <p className="text-sm">{orderDate.toLocaleDateString("id-ID")}</p>
            </div>
            {description ? (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Deskripsi</p>
                <p className="text-sm">{description}</p>
              </div>
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Cek `StatusBadge` cocok untuk status pembayaran**

Run: `grep -n "belum\|sebagian\|lunas" lib/status-color.ts`
Expected: `toneFor` menangani nilai pembayaran. **Jika TIDAK** (mis. `toneFor` hanya kenal status proyek), ganti `<StatusBadge status={paymentStatus} />` dengan `<Badge>` biasa + `paymentStatusLabel[paymentStatus]`:
```tsx
import { Badge } from "@/components/ui/badge";
// ...
{paymentStatus ? <Badge variant="secondary">{paymentStatusLabel[paymentStatus] ?? paymentStatus}</Badge> : null}
```
(Impor `paymentStatusLabel` sudah ada di file. Sesuaikan impor `StatusBadge`/`Badge` sesuai pilihan.)

- [ ] **Step 4: Lint komponen baru**

Run: `pnpm biome check --write components/projects/project-summary.tsx components/projects/surveyor-assign-dialog.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/projects/project-summary.tsx components/projects/surveyor-assign-dialog.tsx
git commit -m "feat(proyek): panel ringkasan ProjectSummary + dialog assign surveyor"
```

---

### Task 3: Wiring `page.tsx` — hapus Overview, render panel

**Files:**
- Modify: `app/dashboard/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `ProjectSummary` (Task 2). Semua data sudah dibaca di page (tidak ada query baru).

- [ ] **Step 1: Ganti impor**

Di `app/dashboard/projects/[id]/page.tsx`, HAPUS impor yang tak lagi dipakai di file ini dan tambahkan `ProjectSummary`:
- Hapus baris `import { AssignSurveyorForm } ...`, `import { StatusBadge } ...`, `import { StatusChanger } ...`, `import { StatusHistory } ...` (keempatnya kini dipakai di dalam `ProjectSummary`/`StatusPipeline`).
- Tambah: `import { ProjectSummary } from "@/components/projects/project-summary";`
- `Card, CardContent, CardHeader, CardTitle` TETAP dipakai (tab Keuangan) — jangan hapus.

- [ ] **Step 2: Hitung progres fase (selesai/total)**

Setelah baris `const progress = await getProjectProgress(user, project.id);` (sekitar `page.tsx:110`), tambahkan:
```tsx
const phasesDone = phases.filter((p) => p.status === "selesai").length;
const phasesTotal = phases.length;
```

- [ ] **Step 3: Ganti blok header lama dengan `ProjectSummary`**

GANTI seluruh blok header (`<div className="flex items-center justify-between"> … </div>`, kira-kira `page.tsx:196-219`) dengan:
```tsx
      <ProjectSummary
        projectId={project.id}
        title={project.title}
        surveyType={project.surveyType}
        clientId={client?.id ?? null}
        clientName={client?.name ?? null}
        surveyorName={assignedSurveyorName}
        assignedSurveyorId={project.assignedSurveyorId}
        surveyors={surveyorRows}
        isAdmin={isAdmin}
        canEdit={user.role === "admin"}
        status={project.status}
        allowedNextStatuses={allowedNextStatuses}
        logs={statusLogs.map((log) => ({
          id: log.id,
          fromStatus: log.fromStatus,
          toStatus: log.toStatus,
          changedByName: nameById.get(log.changedById) ?? "—",
          createdAt: log.createdAt,
        }))}
        progressPercent={progress}
        phasesDone={phasesDone}
        phasesTotal={phasesTotal}
        remaining={paymentSummary ? paymentSummary.remaining : null}
        paymentStatus={paymentSummary ? paymentSummary.status : null}
        locationLabel={project.locationLabel ?? null}
        orderDate={project.orderDate}
        description={project.description ?? null}
      />
```

> Catatan: `allowedNextStatuses` sudah dihitung di `page.tsx` (kosong bila `!canChangeStatus`), jadi surveyor tak berwenang otomatis dapat array kosong → `StatusPipeline` menampilkan teks "tidak ada transisi". Tidak perlu prop `canChangeStatus` terpisah.

- [ ] **Step 4: Hapus tab & konten Overview**

- Hapus `<TabsTrigger value="overview">Overview</TabsTrigger>` dari `<TabsList>`.
- Ubah `<Tabs defaultValue="overview">` → `<Tabs defaultValue="fase">`.
- Hapus seluruh `<TabsContent value="overview" …> … </TabsContent>` (blok berisi Card "Detail proyek", Card "Fase", Card "Assign surveyor", Card "Status"). Semua isinya sudah pindah ke `ProjectSummary` (detail, progres, assign, status) — kecuali Card "Fase" (daftar fase) yang memang redundan dengan tab Fase + progres di panel, jadi memang dibuang.

- [ ] **Step 5: Typecheck (sekarang harus hijau — Task 1 & 3 lengkap)**

Run: `pnpm typecheck`
Expected: PASS, tanpa error. Jika ada error "Cannot find name 'StatusChanger'" atau impor tak terpakai, betulkan sesuai Step 1.

- [ ] **Step 6: Lint**

Run: `pnpm lint`
Expected: PASS (jalankan `pnpm lint:fix` bila ada yang autofix-able).

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/projects/[id]/page.tsx
git commit -m "feat(proyek): render panel ringkasan di detail, hapus tab Overview"
```

---

### Task 4: Verifikasi end-to-end

**Files:**
- Modify (bila perlu): `e2e/*.spec.ts` yang menyentuh alur status/Overview
- Reference: `e2e/project-phases.spec.ts` (klik tab "Fase" via role — tetap valid karena tab Fase dipertahankan)

- [ ] **Step 1: Cari selector e2e yang bergantung pada UI status/Overview lama**

Run: `grep -rn "Overview\|Ubah status\|Pilih status\|Ubah status\|combobox.*[Ss]tatus proyek" e2e`
Expected: identifikasi test yang menekan dropdown status proyek lama atau tab "Overview". (Perhatikan: `project-phases.spec.ts` memakai combobox **"Status fase …"** — itu status FASE di tab Fase, BUKAN status proyek; jangan diubah.)

- [ ] **Step 2: Perbarui selector yang pecah (jika ada)**

Untuk test yang mengubah **status proyek**: ganti langkah "buka tab Overview → pilih dropdown status → klik Ubah status" menjadi menekan tombol pipeline:
```ts
// Maju satu tahap: tombol diawali "Lanjut ke:"
await page.getByRole("button", { name: /^Lanjut ke:/ }).click();
```
Untuk aksi admin (batalkan): buka menu ⋯ lalu item + konfirmasi:
```ts
await page.getByRole("button", { name: "Aksi status lain" }).click();
await page.getByRole("menuitem", { name: "Batalkan proyek" }).click();
await page.getByRole("button", { name: "Ya, lanjut" }).click();
```
Jika tidak ada test yang menyentuh status proyek, catat itu dan lanjut.

- [ ] **Step 3: Jalankan build + suite penuh**

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```
Expected: semua PASS. (`pnpm test` = vitest logic; tak ada test baru, harus tetap hijau.)

- [ ] **Step 4: Jalankan e2e (butuh dev server)**

Pastikan `pnpm dev` jalan di :3000, lalu:
```bash
pnpm e2e
```
Expected: PASS. Jika `project-phases.spec.ts` gagal karena tab Fase, cek `defaultValue="fase"` di Step Task 3.4.

- [ ] **Step 5: Cek manual di browser (gunakan skill `run` atau `verify`)**

Buka satu proyek sebagai admin dan verifikasi mata:
1. Panel ringkasan tampil di atas tab; tidak ada tab "Overview".
2. Pipeline menyorot status sekarang; tombol "Lanjut ke: …" memajukan satu tahap dan badge di stepper ikut geser.
3. Menu ⋯ → "Batalkan proyek" memunculkan dialog konfirmasi; setelah konfirmasi, stepper redup + badge "Dibatalkan"; ⋯ menampilkan "Aktifkan lagi".
4. Tombol "Ubah" surveyor membuka dialog assign; setelah simpan, nama ter-update.
5. "Detail proyek" bisa dibuka/tutup; "Riwayat" menampilkan log status.
6. Sebagai surveyor yang ditugaskan: tombol "Lanjut" ada, menu ⋯ TIDAK ada. Sebagai surveyor tak ditugaskan / status buntu: teks "tidak ada transisi".

- [ ] **Step 6: Commit perubahan e2e (bila ada)**

```bash
git add e2e
git commit -m "test(e2e): sesuaikan selector status proyek ke pipeline baru"
```

---

## Self-Review

**Spec coverage:**
- Panel ringkasan (judul, pipeline, progres, surveyor+assign inline, sisa bayar, disclosure detail) → Task 2 + Task 3. ✓
- Status pipeline (stepper, Lanjut 1-klik, ⋯ admin, konfirmasi destruktif, toggle riwayat, kasus selesai/dibatalkan/surveyor-buntu) → Task 1. ✓
- Hapus Overview, `defaultValue="fase"`, 5 tab tersisa → Task 3. ✓
- Nol perubahan server/auth/transition → dijaga Global Constraints; tak ada task menyentuh `lib/actions/*-logic.ts` atau schema. ✓
- Sisa-bayar-jump-ke-tab dipangkas (YAGNI, dicatat di spec/plan) → baris bayar display-only di Task 2. ✓ (penyimpangan sadar dari spec §A untuk hindari lifting state Tabs ke client.)
- Pengujian: tak ada unit test baru (tanpa infra komponen), verifikasi lewat typecheck/lint/build + e2e + cek manual → Task 4. ✓

**Placeholder scan:** Tak ada TODO/TBD; semua step berisi kode/perintah konkret. ✓

**Type consistency:** `StatusLogRow` dipakai konsisten (Task 1 ekspor ulang dari `status-history.tsx`, Task 2 impor tipe yang sama). Props `ProjectSummary` di Task 2 cocok persis dengan yang dilewatkan di Task 3.4. `allowedNextStatuses: string[]` konsisten. `progressPercent: number | null` cocok dengan `getProjectProgress` (`number | null`). ✓
