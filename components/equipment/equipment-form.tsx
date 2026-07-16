"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { optionsFromLabels, SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { createEquipment, updateEquipment } from "@/lib/actions/equipment";
import type { EquipmentConditionInput } from "@/lib/actions/equipment-schemas";
import { equipmentConditionLabel } from "@/lib/labels";

type FormValues = {
  code: string;
  serialNumber: string;
  condition: EquipmentConditionInput;
  purchaseDate: string;
  purchasePrice: string;
  notes: string;
};

export type EquipmentEditTarget = {
  equipmentId: string;
  code: string;
  serialNumber: string | null;
  condition: EquipmentConditionInput;
  purchaseDate: string | null;
  purchasePrice: number | null;
  notes: string | null;
};

/**
 * Admin-only: tambah unit fisik baru di bawah `itemId`, ATAU edit unit yang
 * ada (spec 2026-07-16). Jenis alat (nama/kategori/gambar) tidak ada di sini
 * lagi — itu `EquipmentItemForm`. `itemId` selalu wajib: untuk create dikirim
 * ke server; untuk edit unit tidak pernah pindah item, jadi tidak dikirim
 * ulang, hanya dipakai untuk teks tampilan oleh pemanggil.
 */
export function EquipmentForm({
  itemId,
  editing,
  onSuccess,
}: {
  itemId: string;
  editing?: EquipmentEditTarget;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = !!editing;

  const defaultValues: FormValues = {
    code: editing?.code ?? "",
    serialNumber: editing?.serialNumber ?? "",
    condition: editing?.condition ?? "tersedia",
    purchaseDate: editing?.purchaseDate ?? "",
    purchasePrice: editing?.purchasePrice != null ? String(editing.purchasePrice) : "",
    notes: editing?.notes ?? "",
  };

  const { control, register, handleSubmit, reset } = useForm<FormValues>({ defaultValues });
  const { executeAsync: executeCreate, isExecuting: isCreating } = useAction(createEquipment);
  const { executeAsync: executeUpdate, isExecuting: isUpdating } = useAction(updateEquipment);
  const isSubmitting = isCreating || isUpdating;

  const onSubmit = async (values: FormValues) => {
    setFormError(null);

    let purchasePrice: number | null = null;
    if (values.purchasePrice.trim()) {
      const parsed = Number(values.purchasePrice.trim());
      if (!Number.isInteger(parsed) || parsed < 0) {
        setFormError("Harga beli harus bilangan bulat non-negatif.");
        return;
      }
      purchasePrice = parsed;
    }

    const payload = {
      code: values.code.trim(),
      serialNumber: values.serialNumber.trim() || undefined,
      condition: values.condition,
      purchaseDate: values.purchaseDate || null,
      purchasePrice,
      notes: values.notes.trim() || undefined,
    };

    const result = isEditing
      ? await executeUpdate({ equipmentId: editing.equipmentId, ...payload })
      : await executeCreate({ itemId, ...payload });

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali data yang dimasukkan.");
      return;
    }

    reset(defaultValues);
    if (onSuccess) {
      onSuccess();
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Kode unit</Label>
        <Input id="code" {...register("code")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="serialNumber">Nomor seri (opsional)</Label>
        <Input id="serialNumber" {...register("serialNumber")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="condition">Kondisi</Label>
        <Controller
          control={control}
          name="condition"
          render={({ field }) => (
            <SelectField
              id="condition"
              className="w-full"
              options={optionsFromLabels(equipmentConditionLabel)}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchaseDate">Tanggal beli (opsional)</Label>
          <Input id="purchaseDate" type="date" {...register("purchaseDate")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchasePrice">Harga beli, IDR (opsional)</Label>
          <Input id="purchasePrice" type="number" min={0} step={1} {...register("purchasePrice")} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Catatan (opsional)</Label>
        <Textarea id="notes" rows={3} {...register("notes")} />
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2 w-fit">
        {isSubmitting ? "Menyimpan..." : isEditing ? "Simpan perubahan" : "Tambah unit"}
      </Button>
    </form>
  );
}
