"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { optionsFromLabels, SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { createClient, updateClient } from "@/lib/actions/clients";
import { clientInputSchema } from "@/lib/actions/clients-schemas";
import { clientTypeLabel } from "@/lib/labels";

type ClientFormValues = z.infer<typeof clientInputSchema>;

export function ClientForm({
  client,
  onSuccess,
}: {
  client?: {
    id: string;
    name: string;
    type: "individual" | "company";
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
  };
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = !!client;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientInputSchema),
    defaultValues: {
      name: client?.name ?? "",
      type: client?.type ?? "individual",
      phone: client?.phone ?? "",
      email: client?.email ?? "",
      address: client?.address ?? "",
      notes: client?.notes ?? "",
    },
  });

  const { executeAsync: executeCreate } = useAction(createClient);
  const { executeAsync: executeUpdate } = useAction(updateClient);

  const onSubmit = async (values: ClientFormValues) => {
    setFormError(null);
    const result = isEditing
      ? await executeUpdate({ ...values, id: client.id })
      : await executeCreate(values);

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali data yang dimasukkan.");
      return;
    }

    const savedId = result?.data?.client.id ?? client?.id;

    if (onSuccess) {
      onSuccess();
      router.refresh();
      return;
    }
    router.push(savedId ? `/dashboard/clients/${savedId}` : "/dashboard/clients");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nama</Label>
        <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
        {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="type">Tipe</Label>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <SelectField
              id="type"
              className="w-full"
              options={optionsFromLabels(clientTypeLabel)}
              value={field.value ?? ""}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Telepon</Label>
        <Input id="phone" {...register("phone")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
        {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">Alamat</Label>
        <Textarea id="address" rows={2} {...register("address")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Catatan</Label>
        <Textarea id="notes" rows={3} {...register("notes")} />
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2 w-fit">
        {isSubmitting ? "Menyimpan..." : isEditing ? "Simpan perubahan" : "Buat klien"}
      </Button>
    </form>
  );
}
