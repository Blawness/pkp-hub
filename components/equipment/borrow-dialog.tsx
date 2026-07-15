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
