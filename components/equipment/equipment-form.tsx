"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormFieldWithTooltip } from "@/components/ui/field-tooltip";
import { Input } from "@/components/ui/input";
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
      <FormFieldWithTooltip
        label="Kode unit"
        htmlFor="code"
        required
        tooltip="Kode inventaris internal studio — unik, dipakai untuk saling merujuk di lapangan dan di laporan. Boleh beda dari nomor seri pabrik."
      >
        <Input id="code" {...register("code")} />
      </FormFieldWithTooltip>

      <FormFieldWithTooltip
        label="Nomor seri (opsional)"
        htmlFor="serialNumber"
        tooltip="Nomor seri dari pabrikan. Boleh dikosongkan kalau tidak ada di nameplate, atau kalau alat adalah rakitan internal."
      >
        <Input id="serialNumber" {...register("serialNumber")} />
      </FormFieldWithTooltip>

      <FormFieldWithTooltip
        label="Kondisi"
        htmlFor="condition"
        tooltip="Kondisi fisik alat. 'Perawatan' atau 'Rusak' menandai alat TIDAK bisa dipinjam, dan 'Pensiun' menyembunyikannya dari katalog aktif."
      >
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
      </FormFieldWithTooltip>

      <div className="grid grid-cols-2 gap-4">
        <FormFieldWithTooltip
          label="Tanggal beli (opsional)"
          htmlFor="purchaseDate"
          tooltip="Tanggal pembelian dalam YYYY-MM-DD. Dipakai untuk laporan aset dan garansi."
        >
          <Input id="purchaseDate" type="date" {...register("purchaseDate")} />
        </FormFieldWithTooltip>
        <FormFieldWithTooltip
          label="Harga beli, IDR (opsional)"
          htmlFor="purchasePrice"
          tooltip="Harga beli dalam rupiah, bilangan bulat. Hanya terlihat oleh admin — surveyor tidak melihat kolom ini di spreadsheet."
        >
          <Input id="purchasePrice" type="number" min={0} step={1} {...register("purchasePrice")} />
        </FormFieldWithTooltip>
      </div>

      <FormFieldWithTooltip
        label="Catatan (opsional)"
        htmlFor="notes"
        tooltip="Catatan bebas: riwayat kalibrasi, lokasi penyimpanan, atau pengingat perawatan. Ditampilkan di detail unit."
      >
        <Textarea id="notes" rows={3} {...register("notes")} />
      </FormFieldWithTooltip>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2 w-fit">
        {isSubmitting ? "Menyimpan..." : isEditing ? "Simpan perubahan" : "Tambah unit"}
      </Button>
    </form>
  );
}
