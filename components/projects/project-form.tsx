"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormFieldWithTooltip } from "@/components/ui/field-tooltip";
import { Input } from "@/components/ui/input";
import { optionsFromLabels, SelectField, type SelectOption } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { createProject, updateProject } from "@/lib/actions/projects";
import { projectInputSchema } from "@/lib/actions/projects-schemas";
import { useToastAction } from "@/lib/hooks/use-toast-action";
import { surveyTypeLabel } from "@/lib/labels";

type ProjectFormValues = z.infer<typeof projectInputSchema>;

export function ProjectForm({
  clients,
  surveyors,
  project,
  onSuccess,
}: {
  clients: { id: string; name: string }[];
  surveyors: { id: string; name: string }[];
  project?: {
    id: string;
    title: string;
    clientId: string;
    surveyType: ProjectFormValues["surveyType"];
    locationLabel: string | null;
    assignedSurveyorId: string | null;
    orderDate: Date;
    description: string | null;
  };
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = !!project;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectInputSchema),
    defaultValues: {
      title: project?.title ?? "",
      clientId: project?.clientId ?? clients[0]?.id ?? "",
      surveyType: project?.surveyType ?? "topografi",
      locationLabel: project?.locationLabel ?? "",
      assignedSurveyorId: project?.assignedSurveyorId ?? "",
      orderDate: project?.orderDate ? project.orderDate.toISOString().slice(0, 10) : "",
      description: project?.description ?? "",
    },
  });

  const { executeAsync: executeCreate } = useToastAction(createProject);
  const { executeAsync: executeUpdate } = useToastAction(updateProject);

  const clientOptions: SelectOption[] = clients.map((c) => ({ value: c.id, label: c.name }));
  const typeOptions = optionsFromLabels(surveyTypeLabel);
  const surveyorOptions: SelectOption[] = [
    { value: "", label: "Belum ditugaskan" },
    ...surveyors.map((s) => ({ value: s.id, label: s.name })),
  ];

  const onSubmit = async (values: ProjectFormValues) => {
    setFormError(null);
    const result = isEditing
      ? await executeUpdate({ ...values, id: project.id })
      : await executeCreate(values);

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali data yang dimasukkan.");
      return;
    }

    if (onSuccess) {
      onSuccess();
      router.refresh();
      return;
    }

    const savedId = result?.data?.project.id ?? project?.id;
    router.push(savedId ? `/dashboard/projects/${savedId}` : "/dashboard/projects");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4" noValidate>
      <FormFieldWithTooltip
        label="Judul"
        htmlFor="title"
        required
        tooltip="Nama proyek yang mudah dikenali di daftar dan laporan, mis. 'Topografi Kavling 12 — Cimahi'."
      >
        <Input id="title" aria-invalid={!!errors.title} {...register("title")} />
      </FormFieldWithTooltip>
      {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}

      {/*
        `register()` hanya bisa dipakai pada elemen form native — ia menempelkan
        ref + onChange ke DOM node. <SelectField> bukan itu, jadi setiap dropdown
        di form ini melewati <Controller>, yang menghubungkan state react-hook-form
        ke pasangan value/onValueChange milik komponennya.
      */}
      <FormFieldWithTooltip
        label="Klien"
        htmlFor="clientId"
        required
        tooltip="Pemilik proyek. Wajib ada sebelum proyek bisa disimpan — kalau belum ada, gunakan tombol 'Buat klien' di header dialog."
      >
        <Controller
          control={control}
          name="clientId"
          render={({ field }) => (
            <SelectField
              id="clientId"
              className="w-full"
              options={clientOptions}
              value={field.value ?? ""}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              aria-invalid={!!errors.clientId}
            />
          )}
        />
      </FormFieldWithTooltip>
      {errors.clientId ? (
        <p className="text-xs text-destructive">{errors.clientId.message}</p>
      ) : null}

      <FormFieldWithTooltip
        label="Jenis survey"
        htmlFor="surveyType"
        tooltip="Kategori pekerjaan (topografi, kavling, batas tanah, luas bangunan, lainnya). Memengaruhi label default di laporan dan portal klien."
      >
        <Controller
          control={control}
          name="surveyType"
          render={({ field }) => (
            <SelectField
              id="surveyType"
              className="w-full"
              options={typeOptions}
              value={field.value ?? ""}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </FormFieldWithTooltip>

      <FormFieldWithTooltip
        label="Alamat / lokasi lahan"
        htmlFor="locationLabel"
        tooltip="Penanda lokasi umum — alamat, nama dusun, atau ringkasan singkat. Peta detail (GeoJSON) disimpan terpisah di tab Peta."
      >
        <Input id="locationLabel" {...register("locationLabel")} />
      </FormFieldWithTooltip>

      {!isEditing ? (
        <FormFieldWithTooltip
          label="Surveyor"
          htmlFor="assignedSurveyorId"
          tooltip="Surveyor utama yang bertanggung jawab atas proyek. Setelah dibuat, surveyor diubah lewat halaman detail (tombol ganti di pojok kanan atas)."
        >
          <Controller
            control={control}
            name="assignedSurveyorId"
            render={({ field }) => (
              <SelectField
                id="assignedSurveyorId"
                className="w-full"
                options={surveyorOptions}
                value={field.value ?? ""}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </FormFieldWithTooltip>
      ) : (
        <p className="text-xs text-muted-foreground">
          Surveyor yang ditugaskan diubah lewat halaman detail proyek, bukan di sini.
        </p>
      )}

      <FormFieldWithTooltip
        label="Tanggal order"
        htmlFor="orderDate"
        required
        tooltip="Tanggal proyek diterima dari klien. Default: hari ini. Bisa diubah di sini sebelum proyek disimpan; setelah itu lewat halaman detail."
      >
        <Input id="orderDate" type="date" {...register("orderDate")} />
      </FormFieldWithTooltip>

      <FormFieldWithTooltip
        label="Deskripsi"
        htmlFor="description"
        tooltip="Catatan tambahan tentang proyek, mis. ruang lingkup atau instruksi khusus. Tidak terlihat oleh klien."
      >
        <Textarea id="description" rows={3} {...register("description")} />
      </FormFieldWithTooltip>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2 w-fit">
        {isSubmitting ? "Menyimpan..." : isEditing ? "Simpan perubahan" : "Buat proyek"}
      </Button>
    </form>
  );
}
