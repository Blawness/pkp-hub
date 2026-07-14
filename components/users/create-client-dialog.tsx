"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
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
import { createClientUserAction } from "@/lib/actions/users";
import { createClientUserSchema } from "@/lib/actions/users-schemas";

type FormValues = z.infer<typeof createClientUserSchema>;

/**
 * Tambah akun portal klien secara manual. Admin mengisi nama/email/password awal
 * (dan opsional telepon/alamat tipe), lalu sistem membuat baris `clients` +
 * user `client` + kredential sekaligus — teraut secara langsung, tanpa email.
 *
 * Password yang diketik di sini tidak pernah disimpan mentah; yang masuk DB
 * hanya hash Better Auth.
 */
export function CreateClientDialog() {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createClientUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      type: "individual",
      phone: "",
      address: "",
    },
  });

  const { execute, isPending } = useAction(createClientUserAction, {
    onSuccess: () => {
      reset();
      setFormError(null);
      setOpen(false);
    },
    onError: ({ error }) => {
      setFormError(error.serverError ?? "Gagal membuat akun klien.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <PlusIcon />
            Tambah klien
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={handleSubmit((values) => execute(values))}>
          <DialogHeader>
            <DialogTitle>Tambah akun klien</DialogTitle>
            <DialogDescription>
              Membuat akun portal klien sekaligus datanya. Sampaikan password awal ini ke klien
              lewat jalur pribadi. Password tidak bisa dilihat lagi setelah dialog ditutup.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nama</Label>
              <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
              {errors.name ? (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password awal</Label>
              <Input
                id="password"
                type="text"
                autoComplete="off"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Minimal 10 karakter. Sengaja ditampilkan agar bisa disalin sekarang.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="type">Tipe</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <SelectField
                    id="type"
                    className="w-full"
                    options={[
                      { value: "individual", label: "Perorangan" },
                      { value: "company", label: "Perusahaan" },
                    ]}
                    value={field.value ?? "individual"}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">Telepon (opsional)</Label>
              <Input id="phone" aria-invalid={!!errors.phone} {...register("phone")} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="address">Alamat (opsional)</Label>
              <Input id="address" aria-invalid={!!errors.address} {...register("address")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Menyimpan…" : "Buat akun"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
