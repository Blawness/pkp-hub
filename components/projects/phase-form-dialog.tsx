"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { type ReactElement, useState } from "react";
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
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { createPhase, updatePhase } from "@/lib/actions/phases";

type FormValues = {
  name: string;
  description: string;
  weight: string;
  assignedSurveyorId: string;
  targetDate: string;
};

type PhaseEditTarget = {
  phaseId: string;
  name: string;
  description: string | null;
  weight: number;
  assignedSurveyorId: string | null;
  targetDate: string | null;
};

/**
 * Admin-only: tambah fase baru ATAU edit fase yang ada, tergantung apakah
 * `editing` di-pass. Pola sama dengan `record-payment-dialog.tsx` (`useAction`
 * + `executeAsync`, error di state lokal) — bukan `createStaffDialog` yang
 * pakai zodResolver, supaya konsisten dengan komponen fase lain di berkas ini.
 */
export function PhaseFormDialog({
  projectId,
  surveyors,
  editing,
  trigger,
}: {
  projectId: string;
  surveyors: { id: string; name: string }[];
  editing?: PhaseEditTarget;
  trigger: ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const defaultValues: FormValues = {
    name: editing?.name ?? "",
    description: editing?.description ?? "",
    weight: String(editing?.weight ?? 1),
    assignedSurveyorId: editing?.assignedSurveyorId ?? "",
    targetDate: editing?.targetDate ?? "",
  };

  const { control, register, handleSubmit, reset } = useForm<FormValues>({ defaultValues });
  const { executeAsync: executeCreate, isExecuting: isCreating } = useAction(createPhase);
  const { executeAsync: executeUpdate, isExecuting: isUpdating } = useAction(updatePhase);
  const isSubmitting = isCreating || isUpdating;

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const weight = Number(values.weight.trim());
    if (!Number.isInteger(weight) || weight < 1) {
      setFormError("Bobot harus bilangan bulat minimal 1.");
      return;
    }

    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      weight,
      assignedSurveyorId: values.assignedSurveyorId || null,
      targetDate: values.targetDate || null,
    };

    const result = editing
      ? await executeUpdate({ phaseId: editing.phaseId, ...payload })
      : await executeCreate({ projectId, ...payload });

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali data yang dimasukkan.");
      return;
    }

    reset(defaultValues);
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Ubah fase" : "Tambah fase"}</DialogTitle>
          <DialogDescription>
            Fase baru selalu masuk di urutan terakhir. Susun ulang lewat tombol naik/turun di daftar
            fase.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phase-name">Nama fase</Label>
            <Input id="phase-name" {...register("name")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phase-description">Catatan internal (opsional)</Label>
            <Textarea
              id="phase-description"
              rows={2}
              placeholder="Tidak terlihat oleh klien."
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phase-weight">Bobot</Label>
              <Input id="phase-weight" type="number" min={1} step={1} {...register("weight")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phase-target">Target (opsional)</Label>
              <Input id="phase-target" type="date" {...register("targetDate")} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phase-surveyor">Penanggung jawab (opsional)</Label>
            <Controller
              control={control}
              name="assignedSurveyorId"
              render={({ field }) => (
                <SelectField
                  id="phase-surveyor"
                  className="w-full"
                  options={[
                    { value: "", label: "Belum ditugaskan" },
                    ...surveyors.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
