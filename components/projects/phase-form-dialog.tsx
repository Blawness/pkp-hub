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
import { FormFieldWithTooltip } from "@/components/ui/field-tooltip";
import { Input } from "@/components/ui/input";
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
          <FormFieldWithTooltip
            label="Nama fase"
            htmlFor="phase-name"
            required
            tooltip="Nama fase pekerjaan, mis. 'Pengukuran Lapangan' atau 'Pengolahan Data'."
          >
            <Input id="phase-name" {...register("name")} />
          </FormFieldWithTooltip>

          <FormFieldWithTooltip
            label="Catatan internal (opsional)"
            htmlFor="phase-description"
            tooltip="Catatan hanya untuk tim internal. Tidak pernah dikirim ke klien lewat portal atau email."
          >
            <Textarea
              id="phase-description"
              rows={2}
              placeholder="Tidak terlihat oleh klien."
              {...register("description")}
            />
          </FormFieldWithTooltip>

          <div className="grid grid-cols-2 gap-4">
            <FormFieldWithTooltip
              label="Bobot"
              htmlFor="phase-weight"
              tooltip="Kontribusi fase terhadap progres total. Default 1. Persen dihitung dari perbandingan antar-fase, jadi total tidak harus 100."
            >
              <Input id="phase-weight" type="number" min={1} step={1} {...register("weight")} />
            </FormFieldWithTooltip>
            <FormFieldWithTooltip
              label="Target (opsional)"
              htmlFor="phase-target"
              tooltip="Tanggal kalender target selesai fase (YYYY-MM-DD). Lewat tanggal ini dengan status belum/berjalan ditandai 'Telat' di timeline."
            >
              <Input id="phase-target" type="date" {...register("targetDate")} />
            </FormFieldWithTooltip>
          </div>

          <FormFieldWithTooltip
            label="Penanggung jawab (opsional)"
            htmlFor="phase-surveyor"
            tooltip="Surveyor yang bertanggung jawab atas fase ini. Menugaskan seseorang ke satu fase memberi mereka akses ke proyek yang sama (aturan 'assigned' di RBAC)."
          >
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
          </FormFieldWithTooltip>

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
