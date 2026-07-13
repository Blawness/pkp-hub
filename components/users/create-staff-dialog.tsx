"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { createStaffUserAction } from "@/lib/actions/users";
import { createStaffUserSchema } from "@/lib/actions/users-schemas";

type FormValues = z.infer<typeof createStaffUserSchema>;

/**
 * Tambah akun staf. Admin mengetik password awalnya sendiri dan menyampaikannya
 * ke orangnya lewat jalur di luar sistem ini.
 *
 * Password yang diketik di sini TIDAK pernah disimpan mentah dan tidak bisa
 * dilihat lagi setelah dialog ditutup — yang masuk database hanya hash Better
 * Auth. Kalau lupa, jalannya bukan "lihat password", melainkan setel ulang.
 */
export function CreateStaffDialog() {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createStaffUserSchema),
    defaultValues: { name: "", email: "", role: "surveyor", password: "" },
  });

  const { execute, isPending } = useAction(createStaffUserAction, {
    onSuccess: () => {
      reset();
      setFormError(null);
      setOpen(false);
    },
    onError: ({ error }) => {
      setFormError(error.serverError ?? "Gagal membuat akun.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon />
            Tambah staf
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={handleSubmit((values) => execute(values))}>
          <DialogHeader>
            <DialogTitle>Tambah akun staf</DialogTitle>
            <DialogDescription>
              Sampaikan password awal ini ke yang bersangkutan lewat jalur pribadi. Password tidak
              bisa dilihat lagi setelah dialog ditutup.
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
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                {...register("role")}
              >
                <option value="surveyor">Surveyor</option>
                <option value="admin">Admin</option>
              </select>
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
