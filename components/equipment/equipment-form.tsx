"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { EquipmentImageField } from "@/components/equipment/equipment-image-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { optionsFromLabels, SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { createEquipment, updateEquipment } from "@/lib/actions/equipment";
import type {
  EquipmentCategoryInput,
  EquipmentConditionInput,
} from "@/lib/actions/equipment-schemas";
import { equipmentCategoryLabel, equipmentConditionLabel } from "@/lib/labels";

type FormValues = {
  name: string;
  category: EquipmentCategoryInput;
  serialNumber: string;
  condition: EquipmentConditionInput;
  purchaseDate: string;
  purchasePrice: string;
  notes: string;
};

type EquipmentEditTarget = {
  equipmentId: string;
  name: string;
  category: EquipmentCategoryInput;
  serialNumber: string | null;
  condition: EquipmentConditionInput;
  image: string | null;
  /** URL yang sudah di-resolve untuk pratinjau gambar lama (server: `downloadUrlFor`). */
  imageDisplayUrl: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  notes: string | null;
};

/**
 * Admin-only: tambah alat baru ATAU edit alat yang ada, tergantung apakah
 * `editing` di-pass — pola sama dengan `PhaseFormDialog`/`RecordPaymentDialog`
 * (`useAction` + `executeAsync`, error di state lokal). Halaman ini sendiri
 * (`new/page.tsx`, `[id]/edit/page.tsx`) sudah memanggil `requireAdmin()` di
 * server; komponen ini tidak perlu mengulang itu.
 */
export function EquipmentForm({ editing }: { editing?: EquipmentEditTarget }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(editing?.image ?? null);
  const isEditing = !!editing;

  const defaultValues: FormValues = {
    name: editing?.name ?? "",
    category: editing?.category ?? "total_station",
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
      name: values.name.trim(),
      category: values.category,
      serialNumber: values.serialNumber.trim() || undefined,
      condition: values.condition,
      image,
      purchaseDate: values.purchaseDate || null,
      purchasePrice,
      notes: values.notes.trim() || undefined,
    };

    const result = isEditing
      ? await executeUpdate({ equipmentId: editing.equipmentId, ...payload })
      : await executeCreate(payload);

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali data yang dimasukkan.");
      return;
    }

    const savedId = result?.data?.item.id ?? editing?.equipmentId;
    reset(defaultValues);
    router.push(savedId ? `/dashboard/equipment/${savedId}` : "/dashboard/equipment");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nama alat</Label>
        <Input id="name" {...register("name")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Gambar (opsional)</Label>
        <EquipmentImageField
          value={image}
          displayUrl={editing?.imageDisplayUrl ?? null}
          onChange={setImage}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category">Kategori</Label>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <SelectField
              id="category"
              className="w-full"
              options={optionsFromLabels(equipmentCategoryLabel)}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
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
        {isSubmitting ? "Menyimpan..." : isEditing ? "Simpan perubahan" : "Tambah alat"}
      </Button>
    </form>
  );
}
