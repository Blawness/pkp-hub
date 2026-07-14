"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
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
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { borrowEquipment } from "@/lib/actions/equipment";

type FormValues = {
  equipmentId: string;
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
 * Dialog pinjam alat, dipasang di tab "Alat" detail proyek.
 *
 * ATURAN KERAS: pilihan "dipakai oleh" HANYA dirender untuk admin
 * (`isAdmin`). Surveyor tidak punya field itu di form ini sama sekali — dan
 * itu bukan penegakan, `borrowEquipmentForUser` di server MEMAKSA
 * `usedById` jadi id surveyor sendiri terlepas dari apa pun yang dikirim.
 * Form yang tidak merendernya cuma mencegah kebingungan UI, bukan lubang
 * keamanan yang butuh ditambal di sini.
 */
export function BorrowDialog({
  projectId,
  borrowable,
  isAdmin,
  surveyors,
}: {
  projectId: string;
  borrowable: { id: string; name: string }[];
  isAdmin: boolean;
  surveyors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const defaultValues: FormValues = {
    equipmentId: borrowable[0]?.id ?? "",
    startedAt: nowLocalDatetime(),
    usedById: "",
    note: "",
  };

  const { control, register, handleSubmit, reset } = useForm<FormValues>({ defaultValues });
  const { executeAsync, isExecuting } = useAction(borrowEquipment);

  const equipmentOptions: SelectOption[] = borrowable.map((e) => ({ value: e.id, label: e.name }));

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    if (!values.equipmentId) {
      setFormError("Pilih alat yang akan dipinjam.");
      return;
    }

    const result = await executeAsync({
      equipmentId: values.equipmentId,
      projectId,
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button disabled={borrowable.length === 0} className="w-fit">
            Pinjam alat
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pinjam alat</DialogTitle>
          <DialogDescription>
            Sesi pakai menempel ke proyek ini. Hanya alat yang berstatus tersedia dan tidak sedang
            dipakai yang muncul di daftar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="borrow-equipment">Alat</Label>
            <Controller
              control={control}
              name="equipmentId"
              render={({ field }) => (
                <SelectField
                  id="borrow-equipment"
                  className="w-full"
                  options={equipmentOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </div>

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
                  <SelectField
                    id="borrow-used-by"
                    className="w-full"
                    options={[
                      { value: "", label: "Saya sendiri" },
                      ...surveyors.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
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
