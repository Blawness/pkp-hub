# Perbaikan UX Inventaris Alat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mempermudah alur inventaris (pinjam/kembalikan/lihat status) untuk surveyor (HP) dan admin (desktop) tanpa mengubah lapisan server.

**Architecture:** Semua perubahan di lapisan UI + data yang diteruskan ke UI. Dua primitive baru (`Combobox`, `ConfirmDialog`) dibangun di atas `Dialog` Base UI yang sudah ada. `BorrowDialog` di-refactor jadi dua mode (proyek terkunci / alat terkunci). Daftar alat mendapat kolom Aksi (desktop) + tampilan kartu (mobile) + ringkasan status. Aturan bisnis, action, guard, dan skema **tidak disentuh**.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, react-hook-form, next-safe-action, Base UI, Tailwind v4, TanStack Table, Biome.

## Global Constraints

- **Server tidak berubah.** Jangan sentuh `lib/actions/equipment*.ts`, `lib/equipment/derive.ts`, `lib/db/schema.ts`, `lib/auth-guards.ts`. Payload ke `borrowEquipment`/`returnEquipment` tetap sama persis.
- **Dropdown = komponen sendiri, bukan popup native.** Alasan dark-mode di `components/ui/select-field.tsx`. `Combobox` baru harus merender popup-nya sendiri (pakai `Dialog`), bukan `<datalist>`/`<select>`.
- **Durasi & angka turunan dihitung di SERVER** lalu diteruskan sebagai string/number ke komponen klien — hindari mismatch hidrasi (pola `usage-history.tsx`).
- **Bahasa UI: Indonesia.** Label tombol/teks mengikuti gaya yang ada ("Pinjam", "Kembalikan", "Batal").
- **Verifikasi per task:** `pnpm typecheck` && `pnpm lint` harus hijau. Repo ini meng-unit-test logika bisnis (yang di sini tidak berubah) lewat vitest terhadap DB nyata; komponen React tidak punya harness unit-test. Karena itu setiap task diverifikasi lewat typecheck+lint; verifikasi perilaku end-to-end dilakukan di Task 8 (browser).
- **Commit tiap task.** Akhiri `git commit` dengan trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

Baru:
- `components/ui/combobox.tsx` — single-select yang bisa dicari (Task 1)
- `components/ui/confirm-dialog.tsx` — dialog konfirmasi generik (Task 2)
- `components/equipment/equipment-summary.tsx` — kartu ringkasan + quick-filter (Task 5)
- `components/equipment/equipment-card-list.tsx` — daftar kartu alat untuk mobile (Task 7)

Diubah:
- `components/equipment/borrow-dialog.tsx` — dua mode + Combobox (Task 3)
- `components/equipment/project-equipment.tsx` — adaptasi props BorrowDialog (Task 3)
- `components/equipment/return-button.tsx` — konfirmasi (Task 4)
- `components/equipment/usage-history.tsx` — teruskan nama alat + durasi (Task 4)
- `components/equipment/equipment-columns.tsx` — kolom Aksi (Task 6)
- `components/equipment/equipment-table.tsx` — desktop table + mobile cards (Task 7)
- `app/dashboard/equipment/page.tsx` — ringkasan, filter dinaikkan, muat projectOptions+surveyors, perkaya rows (Task 5, 6, 7)
- `app/dashboard/equipment/[id]/page.tsx` — aksi Pinjam/Kembalikan (Task 8)

---

## Catatan desain: kartu ringkasan (deviasi kecil dari spec)

Spec menyebut kartu "Total · Tersedia · Terpinjam · Perawatan/Rusak". Untuk menjaga **quick-filter akurat** (klik kartu → jumlah persis sama dengan hasil filter), plan ini memakai **lima kartu 1:1 dengan nilai filter**: Total, Tersedia, Terpinjam, Perawatan, Rusak. Setiap angka cocok dengan hasil `?status=`. "Pensiun" tetap hanya lewat dropdown (jarang). Ini strictly lebih konsisten daripada kartu gabungan yang tak bisa dipetakan ke satu filter.

---

### Task 1: Primitive `Combobox`

**Files:**
- Create: `components/ui/combobox.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type ComboboxOption = { value: string; label: string };
  export function Combobox(props: {
    options: ComboboxOption[];
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    title?: string;
    id?: string;
    disabled?: boolean;
    "aria-label"?: string;
  }): JSX.Element;
  ```
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogTrigger` dari `@/components/ui/dialog`, `Button`, `Input`, `cn`.

- [ ] **Step 1: Tulis komponen**

Create `components/ui/combobox.tsx`:

```tsx
"use client";

import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string };

/**
 * Single-select yang bisa dicari. Sama alasan dengan `SelectField`: popup-nya
 * digambar sendiri (di dalam `Dialog`), bukan popup native — supaya konsisten
 * di dark mode. Dipakai saat daftar opsi bisa panjang (mis. daftar proyek)
 * dan/atau butuh enak dipakai di layar HP.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Pilih…",
  searchPlaceholder = "Cari…",
  emptyMessage = "Tidak ada hasil.",
  title,
  id,
  disabled,
  "aria-label": ariaLabel,
}: {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  title?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function choose(next: string) {
    onValueChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            id={id}
            disabled={disabled}
            aria-label={ariaLabel}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <DialogContent className="gap-0 p-0 sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="border-b p-3">
          <DialogTitle className="sr-only">{title ?? placeholder}</DialogTitle>
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8"
            />
          </div>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => choose(o.value)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
                  o.value === value && "bg-muted",
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value ? <CheckIcon className="size-4 shrink-0" /> : null}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verifikasi typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (tidak ada error). Komponen belum dipakai — hanya memastikan ia mengcompile.

- [ ] **Step 3: Commit**

```bash
git add components/ui/combobox.tsx
git commit -m "feat(ui): tambah primitive Combobox (searchable select)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Primitive `ConfirmDialog`

**Files:**
- Create: `components/ui/confirm-dialog.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function ConfirmDialog(props: {
    trigger: React.ReactElement;
    title: string;
    description?: React.ReactNode;
    confirmLabel?: string;
    confirmVariant?: "default" | "destructive" | "outline" | "secondary";
    onConfirm: () => Promise<{ error?: string } | void>;
  }): JSX.Element;
  ```
- Consumes: `Dialog`/`DialogClose`/`DialogContent`/`DialogDescription`/`DialogFooter`/`DialogHeader`/`DialogTitle`/`DialogTrigger`, `Button`.

- [ ] **Step 1: Tulis komponen**

Create `components/ui/confirm-dialog.tsx`:

```tsx
"use client";

import { type ReactElement, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Dialog konfirmasi generik. `onConfirm` boleh async dan mengembalikan
 * `{ error }` untuk menampilkan pesan tanpa menutup dialog; mengembalikan
 * `void`/tanpa error akan menutupnya. Dibangun di atas `Dialog` yang ada
 * (belum ada `alert-dialog` di repo ini).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Konfirmasi",
  confirmVariant = "default",
  onConfirm,
}: {
  trigger: ReactElement;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary";
  onConfirm: () => Promise<{ error?: string } | void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    const result = await onConfirm();
    setPending(false);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Batal</DialogClose>
          <Button variant={confirmVariant} disabled={pending} onClick={handleConfirm}>
            {pending ? "Memproses…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verifikasi typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/ui/confirm-dialog.tsx
git commit -m "feat(ui): tambah primitive ConfirmDialog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `BorrowDialog` dua mode + Combobox

**Files:**
- Modify: `components/equipment/borrow-dialog.tsx` (tulis ulang)
- Modify: `components/equipment/project-equipment.tsx:36-60` (adaptasi props)

**Interfaces:**
- Consumes: `Combobox` (Task 1), `borrowEquipment` action.
- Produces:
  ```ts
  export function BorrowDialog(props: {
    trigger?: React.ReactElement;
    fixedProject?: { id: string };
    fixedEquipment?: { id: string; name: string };
    projectOptions?: { id: string; title: string }[];
    equipmentOptions?: { id: string; name: string }[];
    isAdmin: boolean;
    surveyors: { id: string; name: string }[];
  }): JSX.Element;
  ```
  Aturan: sediakan **tepat satu** dari `fixedProject`/`projectOptions`, dan **tepat satu** dari `fixedEquipment`/`equipmentOptions`.

- [ ] **Step 1: Tulis ulang `borrow-dialog.tsx`**

Replace seluruh isi `components/equipment/borrow-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { type ReactElement, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { borrowEquipment } from "@/lib/actions/equipment";

type FormValues = {
  equipmentId: string;
  projectId: string;
  startedAt: string;
  usedById: string;
  note: string;
};

/** `"2026-07-15T10:30"` — nilai default `<input type="datetime-local">`, jam lokal browser. */
function nowLocalDatetime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Dialog pinjam alat, dua mode:
 * - `fixedProject` diisi (dari detail proyek) → user memilih ALAT.
 * - `fixedEquipment` diisi (dari daftar/detail alat) → user memilih PROYEK.
 *
 * ATURAN KERAS: pilihan "dipakai oleh" HANYA dirender untuk admin. Surveyor
 * tidak punya field itu — dan itu bukan penegakan; `borrowEquipmentForUser`
 * di server MEMAKSA `usedById` jadi id surveyor sendiri.
 */
export function BorrowDialog({
  trigger,
  fixedProject,
  fixedEquipment,
  projectOptions,
  equipmentOptions,
  isAdmin,
  surveyors,
}: {
  trigger?: ReactElement;
  fixedProject?: { id: string };
  fixedEquipment?: { id: string; name: string };
  projectOptions?: { id: string; title: string }[];
  equipmentOptions?: { id: string; name: string }[];
  isAdmin: boolean;
  surveyors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Sisi yang bisa dipilih kosong = tidak ada yang bisa dipinjam → matikan trigger default.
  const noEquipmentToPick = !fixedEquipment && (equipmentOptions?.length ?? 0) === 0;
  const noProjectToPick = !fixedProject && (projectOptions?.length ?? 0) === 0;
  const disabled = noEquipmentToPick || noProjectToPick;

  const defaultValues: FormValues = {
    // Alat: default ke opsi pertama (mempertahankan perilaku lama tab proyek).
    equipmentId: fixedEquipment?.id ?? equipmentOptions?.[0]?.id ?? "",
    // Proyek: WAJIB dipilih sadar — jangan default ke proyek acak.
    projectId: fixedProject?.id ?? "",
    startedAt: nowLocalDatetime(),
    usedById: "",
    note: "",
  };

  const { control, register, handleSubmit, reset } = useForm<FormValues>({ defaultValues });
  const { executeAsync, isExecuting } = useAction(borrowEquipment);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    if (!values.equipmentId) {
      setFormError("Pilih alat yang akan dipinjam.");
      return;
    }
    if (!values.projectId) {
      setFormError("Pilih proyek tujuan pemakaian.");
      return;
    }

    const result = await executeAsync({
      equipmentId: values.equipmentId,
      projectId: values.projectId,
      startedAt: new Date(values.startedAt),
      usedById: isAdmin && values.usedById ? values.usedById : undefined,
      note: values.note.trim() || undefined,
    });

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali data yang dimasukkan.");
      return;
    }

    reset({ ...defaultValues, startedAt: nowLocalDatetime() });
    setOpen(false);
    router.refresh();
  };

  const defaultTrigger = (
    <Button disabled={disabled} className="w-fit">
      Pinjam alat
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? defaultTrigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pinjam alat</DialogTitle>
          <DialogDescription>
            {fixedEquipment
              ? `Catat sesi pakai untuk ${fixedEquipment.name}. Pilih proyek tujuannya.`
              : "Sesi pakai menempel ke proyek ini. Hanya alat yang tersedia dan tidak sedang dipakai yang muncul."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {fixedEquipment ? null : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="borrow-equipment">Alat</Label>
              <Controller
                control={control}
                name="equipmentId"
                render={({ field }) => (
                  <Combobox
                    id="borrow-equipment"
                    title="Pilih alat"
                    placeholder="Pilih alat…"
                    searchPlaceholder="Cari alat…"
                    options={(equipmentOptions ?? []).map((e) => ({ value: e.id, label: e.name }))}
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />
            </div>
          )}

          {fixedProject ? null : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="borrow-project">Proyek</Label>
              <Controller
                control={control}
                name="projectId"
                render={({ field }) => (
                  <Combobox
                    id="borrow-project"
                    title="Pilih proyek"
                    placeholder="Pilih proyek…"
                    searchPlaceholder="Cari proyek…"
                    options={(projectOptions ?? []).map((p) => ({ value: p.id, label: p.title }))}
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="borrow-started">Waktu mulai</Label>
            <Input id="borrow-started" type="datetime-local" {...register("startedAt")} />
          </div>

          {isAdmin ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="borrow-used-by">Dipakai oleh (opsional)</Label>
              <Controller
                control={control}
                name="usedById"
                render={({ field }) => (
                  <Combobox
                    id="borrow-used-by"
                    title="Dipakai oleh"
                    placeholder="Saya sendiri"
                    searchPlaceholder="Cari surveyor…"
                    options={[
                      { value: "", label: "Saya sendiri" },
                      ...surveyors.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="borrow-note">Catatan (opsional)</Label>
            <Textarea id="borrow-note" rows={2} {...register("note")} />
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={isExecuting}>
              {isExecuting ? "Menyimpan..." : "Pinjam"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Adaptasi pemanggil di `project-equipment.tsx`**

Di `components/equipment/project-equipment.tsx`, ubah blok `BorrowDialog` (baris ~53-60) dari:

```tsx
      {canRecord ? (
        <BorrowDialog
          projectId={projectId}
          borrowable={borrowable}
          isAdmin={isAdmin}
          surveyors={surveyors}
        />
      ) : null}
```

menjadi:

```tsx
      {canRecord ? (
        <BorrowDialog
          fixedProject={{ id: projectId }}
          equipmentOptions={borrowable}
          isAdmin={isAdmin}
          surveyors={surveyors}
        />
      ) : null}
```

(Props `projectId`, `borrowable`, `canRecord`, `isAdmin`, `surveyors` pada `ProjectEquipment` sendiri **tidak berubah** — hanya cara meneruskannya ke `BorrowDialog`. `borrowable` sudah bertipe `{ id: string; name: string }[]`, cocok dengan `equipmentOptions`.)

- [ ] **Step 3: Verifikasi typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/equipment/borrow-dialog.tsx components/equipment/project-equipment.tsx
git commit -m "feat(inventaris): BorrowDialog dua mode (alat/proyek terkunci) + combobox

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Konfirmasi kembalikan (`ReturnButton`)

**Files:**
- Modify: `components/equipment/return-button.tsx` (tulis ulang)
- Modify: `components/equipment/usage-history.tsx` (teruskan nama alat + durasi)
- Modify: `components/equipment/project-equipment.tsx:101-103` (teruskan nama alat + durasi)

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 2), `returnEquipment` action.
- Produces:
  ```ts
  export function ReturnButton(props: {
    usageId: string;
    equipmentName?: string;
    durationLabel?: string;
  }): JSX.Element;
  ```
- `UsageHistory` mendapat prop baru `equipmentName?: string`.

- [ ] **Step 1: Tulis ulang `return-button.tsx`**

Replace seluruh isi `components/equipment/return-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { returnEquipment } from "@/lib/actions/equipment";

/**
 * Menutup sesi pakai yang sedang berjalan, dengan konfirmasi. `usageId` datang
 * dari sesi yang SUDAH lolos guard di server, jadi tombol ini hanya dirender
 * untuk sesi yang boleh caller tutup — `returnEquipmentForUser` tetap
 * menegakkan itu ulang, ini bukan gantinya.
 */
export function ReturnButton({
  usageId,
  equipmentName,
  durationLabel,
}: {
  usageId: string;
  equipmentName?: string;
  durationLabel?: string;
}) {
  const router = useRouter();
  const { executeAsync } = useAction(returnEquipment);

  async function handleReturn(): Promise<{ error?: string } | void> {
    const result = await executeAsync({ usageId });
    if (result?.serverError) return { error: result.serverError };
    router.refresh();
  }

  const namePart = equipmentName ? ` ${equipmentName}` : " alat ini";
  const durationPart = durationLabel ? ` Sudah berjalan ${durationLabel}.` : "";

  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline">
          Kembalikan
        </Button>
      }
      title="Kembalikan alat?"
      description={`Menutup sesi pakai${namePart}.${durationPart}`}
      confirmLabel="Kembalikan"
      onConfirm={handleReturn}
    />
  );
}
```

- [ ] **Step 2: Teruskan nama alat + durasi di `project-equipment.tsx`**

Di `components/equipment/project-equipment.tsx`, ubah cell Aksi (baris ~101-103) dari:

```tsx
                    <TableCell>
                      {row.canReturn ? <ReturnButton usageId={row.id} /> : null}
                    </TableCell>
```

menjadi:

```tsx
                    <TableCell>
                      {row.canReturn ? (
                        <ReturnButton
                          usageId={row.id}
                          equipmentName={row.equipmentName}
                          durationLabel={row.duration}
                        />
                      ) : null}
                    </TableCell>
```

- [ ] **Step 3: Teruskan nama alat + durasi di `usage-history.tsx`**

Di `components/equipment/usage-history.tsx`:

(a) Tambah prop `equipmentName` pada tanda tangan komponen. Ubah:

```tsx
export function UsageHistory({ rows }: { rows: UsageHistoryRow[] }) {
```

menjadi:

```tsx
export function UsageHistory({
  rows,
  equipmentName,
}: {
  rows: UsageHistoryRow[];
  equipmentName?: string;
}) {
```

(b) Ubah cell Aksi (baris ~66) dari:

```tsx
                <TableCell>{row.canReturn ? <ReturnButton usageId={row.id} /> : null}</TableCell>
```

menjadi:

```tsx
                <TableCell>
                  {row.canReturn ? (
                    <ReturnButton
                      usageId={row.id}
                      equipmentName={equipmentName}
                      durationLabel={row.duration}
                    />
                  ) : null}
                </TableCell>
```

(c) Pemanggil `UsageHistory` di `app/dashboard/equipment/[id]/page.tsx` (baris ~166) — teruskan nama alat. Ubah:

```tsx
          <UsageHistory rows={usageRows} />
```

menjadi:

```tsx
          <UsageHistory rows={usageRows} equipmentName={item.name} />
```

- [ ] **Step 4: Verifikasi typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/equipment/return-button.tsx components/equipment/usage-history.tsx components/equipment/project-equipment.tsx app/dashboard/equipment/[id]/page.tsx
git commit -m "feat(inventaris): konfirmasi sebelum mengembalikan alat

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Ringkasan status + quick-filter

**Files:**
- Create: `components/equipment/equipment-summary.tsx`
- Modify: `app/dashboard/equipment/page.tsx` (hitung angka, render ringkasan, naikkan filter)

**Interfaces:**
- Produces:
  ```ts
  export function EquipmentSummary(props: {
    total: number;
    tersedia: number;
    terpinjam: number;
    perawatan: number;
    rusak: number;
    activeStatus: string; // "" | "tersedia" | "terpinjam" | "perawatan" | "rusak" | ...
  }): JSX.Element;
  ```
- Consumes: `Card`, `cn`, `Link`. Menautkan ke `?status=<value>`.

- [ ] **Step 1: Tulis `equipment-summary.tsx`**

Create `components/equipment/equipment-summary.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Stat = { key: string; label: string; value: number };

/**
 * Kartu ringkasan di atas daftar alat, sekaligus quick-filter. Angkanya
 * DITURUNKAN dari daftar alat di `page.tsx` (bukan kolom tersimpan) dan tiap
 * kartu meng-set `?status=` — cermin dari filter yang sudah ada, jadi jumlah
 * di kartu persis sama dengan hasil filternya. `activeStatus` menyorot kartu
 * yang cocok dengan filter aktif.
 */
export function EquipmentSummary({
  total,
  tersedia,
  terpinjam,
  perawatan,
  rusak,
  activeStatus,
}: {
  total: number;
  tersedia: number;
  terpinjam: number;
  perawatan: number;
  rusak: number;
  activeStatus: string;
}) {
  const stats: Stat[] = [
    { key: "", label: "Total", value: total },
    { key: "tersedia", label: "Tersedia", value: tersedia },
    { key: "terpinjam", label: "Terpinjam", value: terpinjam },
    { key: "perawatan", label: "Perawatan", value: perawatan },
    { key: "rusak", label: "Rusak", value: rusak },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((stat) => {
        const active = activeStatus === stat.key;
        const href = stat.key ? `/dashboard/equipment?status=${stat.key}` : "/dashboard/equipment";
        return (
          <Link key={stat.key || "total"} href={href}>
            <Card
              className={cn(
                "flex flex-col gap-0.5 p-3 transition-colors hover:bg-muted/50",
                active && "ring-2 ring-primary",
              )}
            >
              <span className="text-2xl font-semibold tabular-nums">{stat.value}</span>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Hitung angka & render di `page.tsx`**

Di `app/dashboard/equipment/page.tsx`:

(a) Tambah import di blok import atas:

```tsx
import { EquipmentSummary } from "@/components/equipment/equipment-summary";
```

(b) Setelah `const items = await listEquipmentForUser(user);` (baris ~32), tambahkan penghitungan (dihitung dari `items`, SEBELUM difilter):

```tsx
  const summary = {
    total: items.length,
    terpinjam: items.filter((i) => i.activeUsage).length,
    tersedia: items.filter((i) => !i.activeUsage && i.condition === "tersedia").length,
    perawatan: items.filter((i) => !i.activeUsage && i.condition === "perawatan").length,
    rusak: items.filter((i) => !i.activeUsage && i.condition === "rusak").length,
  };
```

(c) Di dalam `<main>`, tepat setelah `<PageHeader … />` dan sebelum `<EquipmentTable … />`, sisipkan ringkasan + filter (dinaikkan agar selalu terlihat, termasuk di HP):

```tsx
      <EquipmentSummary
        total={summary.total}
        tersedia={summary.tersedia}
        terpinjam={summary.terpinjam}
        perawatan={summary.perawatan}
        rusak={summary.rusak}
        activeStatus={filters.status ?? ""}
      />

      <EquipmentFilters />
```

(d) Hapus prop `toolbar={<EquipmentFilters />}` dari `<EquipmentTable …>` (filter kini dirender di atas, bukan di dalam toolbar tabel). Sisakan prop lain apa adanya untuk saat ini.

- [ ] **Step 3: Verifikasi typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/equipment/equipment-summary.tsx app/dashboard/equipment/page.tsx
git commit -m "feat(inventaris): kartu ringkasan status + quick-filter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Kolom Aksi di daftar alat (desktop) + perkaya baris

**Files:**
- Modify: `app/dashboard/equipment/page.tsx` (muat projectOptions + surveyors, perkaya `rows`, teruskan ke tabel)
- Modify: `components/equipment/equipment-columns.tsx` (kolom Aksi)
- Modify: `components/equipment/equipment-table.tsx` (teruskan props aksi ke builder)

**Interfaces:**
- `EquipmentTableRow` diperluas:
  ```ts
  export type EquipmentTableRow = {
    id: string;
    name: string;
    category: string;
    serialNumber: string | null;
    condition: string;
    image: string | null;
    purchasePrice?: number | null;
    activeUsage: {
      usedByName: string;
      projectTitle: string;
      usageId: string;
      canReturn: boolean;
      durationLabel: string;
    } | null;
    canBorrow: boolean;
  };
  ```
- `buildEquipmentColumns` mendapat konteks aksi:
  ```ts
  export function buildEquipmentColumns(args: {
    isAdmin: boolean;
    projectOptions: { id: string; title: string }[];
    surveyors: { id: string; name: string }[];
  }): ColumnDef<EquipmentTableRow, unknown>[];
  ```
- `EquipmentTable` mendapat props `projectOptions` & `surveyors`.

- [ ] **Step 1: Muat data & perkaya baris di `page.tsx`**

Di `app/dashboard/equipment/page.tsx`:

(a) Tambah import:

```tsx
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { listProjectsForUser } from "@/lib/auth-guards";
import { formatDuration, usageDurationMs } from "@/lib/equipment/derive";
```

(Jika sebagian sudah ter-import, jangan duplikat — gabungkan.)

(b) Setelah `const items = await listEquipmentForUser(user);` (dan blok `summary`), muat proyek yang bisa dipinjami + surveyor (admin):

```tsx
  const userProjects = await listProjectsForUser(user);
  const projectOptions = userProjects.map((p) => ({ id: p.id, title: p.title }));

  const surveyors = isAdmin
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.role, "surveyor"), isNull(users.archivedAt)))
    : [];
```

(c) Perkaya pembentukan `rows` (baris ~51-64). Ganti blok `Promise.all(filtered.map(...))` menjadi:

```tsx
  const now = new Date();
  const rows = await Promise.all(
    filtered.map(async (item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      serialNumber: item.serialNumber,
      condition: item.condition,
      image: item.image ? await downloadUrlFor(item.image) : null,
      purchasePrice: "purchasePrice" in item ? item.purchasePrice : undefined,
      activeUsage: item.activeUsage
        ? {
            usedByName: item.activeUsage.usedByName,
            projectTitle: item.activeUsage.projectTitle,
            usageId: item.activeUsage.usageId,
            // Surveyor hanya boleh menutup sesi miliknya sendiri (cermin server).
            canReturn: isAdmin || item.activeUsage.usedById === user.id,
            durationLabel: formatDuration(
              usageDurationMs({ startedAt: item.activeUsage.startedAt, endedAt: null }, now),
            ),
          }
        : null,
      // Bisa dipinjam: tersedia & tidak sedang dipakai (arsip sudah tersaring di query list).
      canBorrow: item.condition === "tersedia" && !item.activeUsage,
    })),
  );
```

(d) Teruskan konteks aksi ke tabel. Ubah `<EquipmentTable rows={rows} isAdmin={isAdmin} … />` menjadi:

```tsx
      <EquipmentTable
        rows={rows}
        isAdmin={isAdmin}
        projectOptions={projectOptions}
        surveyors={surveyors}
        emptyMessage={
```

(Prop `emptyMessage` dan seterusnya tetap. Ingat `toolbar` sudah dihapus di Task 5.)

- [ ] **Step 2: Tambah kolom Aksi di `equipment-columns.tsx`**

Di `components/equipment/equipment-columns.tsx`:

(a) Tambah import di atas:

```tsx
import { Button } from "@/components/ui/button";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import { ReturnButton } from "@/components/equipment/return-button";
```

(b) Perluas tipe `EquipmentTableRow` (baris ~10-21) agar sama persis dengan blok Interfaces Task 6 di atas (tambah field `activeUsage.usageId`, `activeUsage.canReturn`, `activeUsage.durationLabel`, dan `canBorrow: boolean`).

(c) Ubah tanda tangan `buildEquipmentColumns` dan tambah kolom Aksi di akhir (sebelum `return columns;`):

```tsx
export function buildEquipmentColumns({
  isAdmin,
  projectOptions,
  surveyors,
}: {
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
}): ColumnDef<EquipmentTableRow, unknown>[] {
```

Lalu, setelah blok `if (isAdmin) { columns.push({ … harga beli … }); }`, tambahkan:

```tsx
  columns.push({
    id: "actions",
    header: "Aksi",
    cell: ({ row }) => {
      const item = row.original;
      if (item.activeUsage) {
        if (!item.activeUsage.canReturn) return <span className="text-muted-foreground">—</span>;
        return (
          <ReturnButton
            usageId={item.activeUsage.usageId}
            equipmentName={item.name}
            durationLabel={item.activeUsage.durationLabel}
          />
        );
      }
      if (item.canBorrow) {
        return (
          <BorrowDialog
            fixedEquipment={{ id: item.id, name: item.name }}
            projectOptions={projectOptions}
            isAdmin={isAdmin}
            surveyors={surveyors}
            trigger={
              <Button size="sm" variant="outline">
                Pinjam
              </Button>
            }
          />
        );
      }
      return <span className="text-muted-foreground">—</span>;
    },
  });
```

- [ ] **Step 3: Teruskan props di `equipment-table.tsx`**

Di `components/equipment/equipment-table.tsx`, tambah props dan teruskan ke builder:

```tsx
export function EquipmentTable({
  rows,
  isAdmin,
  projectOptions,
  surveyors,
  emptyMessage = "Belum ada alat.",
}: {
  rows: EquipmentTableRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
  emptyMessage?: ReactNode;
}) {
  return (
    <DataTable
      columns={buildEquipmentColumns({ isAdmin, projectOptions, surveyors })}
      data={rows}
      searchable
      searchPlaceholder="Cari alat…"
      emptyMessage={emptyMessage}
    />
  );
}
```

(Hapus prop `toolbar` dari tanda tangan & dari `<DataTable>` — filter kini di halaman. Hapus juga import `ReactNode` yang tak terpakai bila perlu — Biome akan menandainya; sesuaikan.)

- [ ] **Step 4: Verifikasi typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/equipment/page.tsx components/equipment/equipment-columns.tsx components/equipment/equipment-table.tsx
git commit -m "feat(inventaris): kolom Aksi (Pinjam/Kembalikan) di daftar alat

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Tampilan kartu untuk mobile

**Files:**
- Create: `components/equipment/equipment-card-list.tsx`
- Modify: `components/equipment/equipment-table.tsx` (bungkus desktop table + render kartu mobile)

**Interfaces:**
- Produces:
  ```ts
  export function EquipmentCardList(props: {
    rows: EquipmentTableRow[];
    isAdmin: boolean;
    projectOptions: { id: string; title: string }[];
    surveyors: { id: string; name: string }[];
  }): JSX.Element;
  ```
- Consumes: `EquipmentTableRow` (Task 6), `BorrowDialog`, `ReturnButton`, `Badge`, `Card`, `Input`, `equipmentCategoryLabel`/`equipmentConditionLabel`.

- [ ] **Step 1: Tulis `equipment-card-list.tsx`**

Create `components/equipment/equipment-card-list.tsx`:

```tsx
"use client";

import { ImageIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import type { EquipmentTableRow } from "@/components/equipment/equipment-columns";
import { ReturnButton } from "@/components/equipment/return-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { equipmentCategoryLabel, equipmentConditionLabel } from "@/lib/labels";

const conditionVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  tersedia: "secondary",
  perawatan: "outline",
  rusak: "destructive",
  pensiun: "outline",
};

/**
 * Daftar alat sebagai kartu — dipakai di viewport HP (`md:hidden` di
 * `EquipmentTable`). Surveyor lapangan sering di HP; kartu jauh lebih enak
 * dibanding tabel 5 kolom yang menggulir menyamping. Aksi Pinjam/Kembalikan
 * memakai komponen klien yang sama dengan tabel desktop.
 */
export function EquipmentCardList({
  rows,
  isAdmin,
  projectOptions,
  surveyors,
}: {
  rows: EquipmentTableRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || (r.serialNumber ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari alat…"
      />
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada alat.</p>
      ) : (
        filtered.map((item) => (
          <Card key={item.id} className="flex flex-col gap-3 p-3">
            <div className="flex items-start gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                {item.image ? (
                  // biome-ignore lint/performance/noImgElement: gambar hasil upload, bukan aset statis
                  <img src={item.image} alt={item.name} className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/equipment/${item.id}`}
                  className="font-medium hover:underline"
                >
                  {item.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {equipmentCategoryLabel[item.category] ?? item.category}
                  {item.serialNumber ? ` · SN ${item.serialNumber}` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              {item.activeUsage ? (
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Badge className="w-fit">Terpinjam</Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.activeUsage.usedByName} · {item.activeUsage.projectTitle}
                  </span>
                </div>
              ) : (
                <Badge variant={conditionVariant[item.condition] ?? "secondary"}>
                  {equipmentConditionLabel[item.condition] ?? item.condition}
                </Badge>
              )}

              {item.activeUsage ? (
                item.activeUsage.canReturn ? (
                  <ReturnButton
                    usageId={item.activeUsage.usageId}
                    equipmentName={item.name}
                    durationLabel={item.activeUsage.durationLabel}
                  />
                ) : null
              ) : item.canBorrow ? (
                <BorrowDialog
                  fixedEquipment={{ id: item.id, name: item.name }}
                  projectOptions={projectOptions}
                  isAdmin={isAdmin}
                  surveyors={surveyors}
                  trigger={
                    <Button size="sm" variant="outline">
                      Pinjam
                    </Button>
                  }
                />
              ) : null}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Bungkus kedua tampilan di `equipment-table.tsx`**

Ubah `return` di `components/equipment/equipment-table.tsx` agar tabel hanya tampil di `md+` dan kartu di bawahnya. Tambah import `EquipmentCardList`, lalu:

```tsx
  return (
    <>
      <div className="hidden md:block">
        <DataTable
          columns={buildEquipmentColumns({ isAdmin, projectOptions, surveyors })}
          data={rows}
          searchable
          searchPlaceholder="Cari alat…"
          emptyMessage={emptyMessage}
        />
      </div>
      <div className="md:hidden">
        {rows.length === 0 ? (
          emptyMessage
        ) : (
          <EquipmentCardList
            rows={rows}
            isAdmin={isAdmin}
            projectOptions={projectOptions}
            surveyors={surveyors}
          />
        )}
      </div>
    </>
  );
```

Import baru di atas file:

```tsx
import { EquipmentCardList } from "@/components/equipment/equipment-card-list";
```

- [ ] **Step 3: Verifikasi typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/equipment/equipment-card-list.tsx components/equipment/equipment-table.tsx
git commit -m "feat(inventaris): tampilan kartu daftar alat untuk mobile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Aksi Pinjam/Kembalikan di detail alat + verifikasi end-to-end

**Files:**
- Modify: `app/dashboard/equipment/[id]/page.tsx` (aksi di kartu "Status pakai")

**Interfaces:**
- Consumes: `BorrowDialog`, `ReturnButton` (Task 3/4), `listProjectsForUser`, `formatDuration`/`usageDurationMs` (sudah dipakai di file ini).

- [ ] **Step 1: Muat projectOptions + surveyors di detail page**

Di `app/dashboard/equipment/[id]/page.tsx`:

(a) Tambah import (gabungkan dengan yang sudah ada; `db`, `users`, `formatDuration`, `usageDurationMs` sudah ter-import):

```tsx
import { and, eq, inArray, isNull } from "drizzle-orm";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import { ReturnButton } from "@/components/equipment/return-button";
import { listProjectsForUser } from "@/lib/auth-guards";
```

(Catatan: `inArray` sudah ter-import — pastikan `and`, `eq`, `isNull` ditambahkan ke import `drizzle-orm` yang ada tanpa duplikasi.)

(b) Setelah `const item = await getEquipmentForUser(user, id);` tambahkan:

```tsx
  const userProjects = await listProjectsForUser(user);
  const projectOptions = userProjects.map((p) => ({ id: p.id, title: p.title }));
  const surveyors = isAdmin
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.role, "surveyor"), isNull(users.archivedAt)))
    : [];
  const canReturnActive =
    item.activeUsage !== null && (isAdmin || item.activeUsage.usedById === user.id);
```

- [ ] **Step 2: Tambah aksi di kartu "Status pakai"**

Di kartu "Status pakai" (baris ~112-130), ubah `<CardContent>` agar menampilkan tombol aksi. Ganti isi `<CardContent>` menjadi:

```tsx
        <CardContent className="flex flex-col gap-3">
          {item.activeUsage ? (
            <>
              <p className="text-sm">
                Sedang dipakai oleh{" "}
                <span className="font-medium">{item.activeUsage.usedByName}</span> untuk proyek{" "}
                <span className="font-medium">{item.activeUsage.projectTitle}</span> · berjalan{" "}
                {formatDuration(
                  usageDurationMs({ startedAt: item.activeUsage.startedAt, endedAt: null }, now),
                )}
              </p>
              {canReturnActive ? (
                <ReturnButton
                  usageId={item.activeUsage.usageId}
                  equipmentName={item.name}
                  durationLabel={formatDuration(
                    usageDurationMs({ startedAt: item.activeUsage.startedAt, endedAt: null }, now),
                  )}
                />
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Tersedia — tidak sedang dipakai.</p>
              {item.condition === "tersedia" && !item.archivedAt ? (
                <BorrowDialog
                  fixedEquipment={{ id: item.id, name: item.name }}
                  projectOptions={projectOptions}
                  isAdmin={isAdmin}
                  surveyors={surveyors}
                />
              ) : null}
            </>
          )}
        </CardContent>
```

- [ ] **Step 3: Verifikasi typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: semua PASS.

- [ ] **Step 4: Verifikasi perilaku end-to-end (skill `verify` / playwright)**

Jalankan dev server (`pnpm dev`) dan periksa:
1. **Admin – pinjam dari daftar alat (desktop):** klik "Pinjam" pada baris alat tersedia → pilih proyek lewat combobox → submit → baris berubah jadi "Terpinjam"; buka proyek itu → sesi muncul di tab Alat.
2. **Admin – kembalikan dari daftar:** klik "Kembalikan" → muncul dialog konfirmasi (nama alat + durasi) → "Kembalikan" → status kembali "Tersedia".
3. **Surveyor – pinjam dari detail alat:** login surveyor → combobox proyek HANYA menampilkan proyek miliknya; field "Dipakai oleh" TIDAK muncul.
4. **Kartu ringkasan:** klik kartu "Terpinjam" → URL jadi `?status=terpinjam` dan daftar tersaring; angka kartu cocok dengan jumlah hasil.
5. **Mobile:** kecilkan viewport ke lebar HP → daftar berubah jadi kartu; tombol Pinjam/Kembalikan berfungsi; combobox proyek/alat bisa dicari.
6. **Guard tetap:** jalankan `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/equipment.test.ts` → semua hijau (memastikan tidak ada regresi server).

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/equipment/[id]/page.tsx
git commit -m "feat(inventaris): aksi Pinjam/Kembalikan di detail alat

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- A. Pinjam langsung dari alat → Task 3 (dialog dua mode), Task 6 (kolom Aksi daftar), Task 7 (kartu mobile), Task 8 (detail). ✓
- B. Ringkasan + quick-filter → Task 5. ✓ (5 kartu 1:1 filter, deviasi terdokumentasi.)
- C. Konfirmasi kembalikan → Task 2 (primitive), Task 4 (ReturnButton). ✓
- D. Mobile + search → Task 1 (Combobox), Task 7 (kartu mobile + search), filter dinaikkan di Task 5. ✓
- Primitive baru `Combobox` & `ConfirmDialog` → Task 1 & 2. ✓
- "Server tidak berubah" → tidak ada task menyentuh `lib/actions/equipment*`, `derive.ts`, `schema.ts`, guard. ✓

**Type consistency:**
- `EquipmentTableRow.activeUsage` diperluas di Task 6 dan dikonsumsi identik di Task 6 (kolom) & Task 7 (kartu): `{ usedByName, projectTitle, usageId, canReturn, durationLabel }`. ✓
- `BorrowDialog` props (`fixedProject`/`fixedEquipment`/`projectOptions`/`equipmentOptions`) konsisten antara Task 3 (definisi), Task 6, Task 7, Task 8 (pemakaian). ✓
- `ReturnButton(usageId, equipmentName?, durationLabel?)` konsisten di Task 4, 6, 7, 8. ✓
- `EquipmentTable` props (`projectOptions`, `surveyors`, tanpa `toolbar`) konsisten antara Task 6 & 7 dan pemanggil di `page.tsx` (Task 6). ✓
- `listProjectsForUser` mengembalikan baris dengan `.id` & `.title` (dipetakan ke `projectOptions`); jika ternyata namanya berbeda, sesuaikan pemetaan saat implementasi (verifikasi cepat di Task 6 Step 1).

**Placeholder scan:** tidak ada TBD/TODO; setiap step berisi kode nyata. ✓
