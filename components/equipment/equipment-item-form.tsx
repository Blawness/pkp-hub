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
import { createEquipmentItem, updateEquipmentItem } from "@/lib/actions/equipment-items";
import type { EquipmentCategoryInput } from "@/lib/actions/equipment-schemas";
import { equipmentCategoryLabel } from "@/lib/labels";

type FormValues = { name: string; category: EquipmentCategoryInput };

export type EquipmentItemEditTarget = {
  itemId: string;
  name: string;
  category: EquipmentCategoryInput;
  image: string | null;
  /** URL yang sudah di-resolve untuk pratinjau gambar lama (server: `downloadUrlFor`). */
  imageDisplayUrl: string | null;
};

/**
 * Admin-only: tambah jenis alat baru ATAU edit jenis yang ada (spec
 * 2026-07-16) — pola sama dengan `EquipmentForm` (unit). Unit fisiknya
 * ditambahkan terpisah, dari accordion halaman daftar (`EquipmentFormDialog`
 * dengan `itemId` tetap), bukan dari sini.
 */
export function EquipmentItemForm({
  editing,
  onSuccess,
}: {
  editing?: EquipmentItemEditTarget;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(editing?.image ?? null);
  const isEditing = !!editing;

  const defaultValues: FormValues = {
    name: editing?.name ?? "",
    category: editing?.category ?? "instrumen_ukur",
  };

  const { control, register, handleSubmit, reset } = useForm<FormValues>({ defaultValues });
  const { executeAsync: executeCreate, isExecuting: isCreating } = useAction(createEquipmentItem);
  const { executeAsync: executeUpdate, isExecuting: isUpdating } = useAction(updateEquipmentItem);
  const isSubmitting = isCreating || isUpdating;

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const payload = { name: values.name.trim(), category: values.category, image };

    const result = isEditing
      ? await executeUpdate({ itemId: editing.itemId, ...payload })
      : await executeCreate(payload);

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
        <Label htmlFor="item-name">Nama jenis alat</Label>
        <Input id="item-name" {...register("name")} />
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
        <Label htmlFor="item-category">Kategori</Label>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <SelectField
              id="item-category"
              className="w-full"
              options={optionsFromLabels(equipmentCategoryLabel)}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2 w-fit">
        {isSubmitting ? "Menyimpan..." : isEditing ? "Simpan perubahan" : "Tambah jenis alat"}
      </Button>
    </form>
  );
}
