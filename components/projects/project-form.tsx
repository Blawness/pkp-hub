"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProject, updateProject } from "@/lib/actions/projects";
import { projectInputSchema } from "@/lib/actions/projects-schemas";
import { surveyTypeLabel } from "@/lib/labels";

type ProjectFormValues = z.infer<typeof projectInputSchema>;

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ProjectForm({
  clients,
  surveyors,
  project,
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
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = !!project;

  const {
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

  const { executeAsync: executeCreate } = useAction(createProject);
  const { executeAsync: executeUpdate } = useAction(updateProject);

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

    const savedId = result?.data?.project.id ?? project?.id;
    router.push(savedId ? `/dashboard/projects/${savedId}` : "/dashboard/projects");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Judul</Label>
        <Input id="title" aria-invalid={!!errors.title} {...register("title")} />
        {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clientId">Klien</Label>
        <select id="clientId" className={selectClassName} {...register("clientId")}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.clientId ? (
          <p className="text-xs text-destructive">{errors.clientId.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="surveyType">Jenis survey</Label>
        <select id="surveyType" className={selectClassName} {...register("surveyType")}>
          {Object.entries(surveyTypeLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="locationLabel">Alamat / lokasi lahan</Label>
        <Input id="locationLabel" {...register("locationLabel")} />
      </div>

      {!isEditing ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assignedSurveyorId">Surveyor</Label>
          <select
            id="assignedSurveyorId"
            className={selectClassName}
            {...register("assignedSurveyorId")}
          >
            <option value="">Belum ditugaskan</option>
            {surveyors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Surveyor yang ditugaskan diubah lewat halaman detail proyek, bukan di sini.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="orderDate">Tanggal order</Label>
        <Input id="orderDate" type="date" {...register("orderDate")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Deskripsi</Label>
        <Textarea id="description" rows={3} {...register("description")} />
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2 w-fit">
        {isSubmitting ? "Menyimpan..." : isEditing ? "Simpan perubahan" : "Buat proyek"}
      </Button>
    </form>
  );
}
