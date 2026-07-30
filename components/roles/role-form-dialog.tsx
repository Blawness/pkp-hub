"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { RolePermissionEditor, type ScopeChoice } from "@/components/roles/role-permission-editor";
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
import { createRoleAction, updateRoleAction } from "@/lib/actions/roles";
import type { RoleSummary } from "@/lib/actions/roles-logic";
import { useToastAction } from "@/lib/hooks/use-toast-action";

/**
 * Hanya field yang dipegang react-hook-form. Sengaja TIDAK memakai
 * `createRoleSchema` dari `roles-schemas.ts`: schema itu mengimpor
 * `isPermission` dari katalog RBAC, dan tiap file resource di sana mengimpor
 * tabel Drizzle-nya — mengimpornya dari komponen client menyeret `lib/db` dan
 * `pg` ke bundle browser (halaman jadi blank). Validasi sebenarnya tetap
 * dilakukan server lewat `createRoleSchema` di action; ini cuma cermin
 * client-side-nya untuk UX.
 *
 * `grants` juga tidak ikut: ia dikelola `useState` di bawah, karena editor
 * scope-nya bukan input form biasa.
 */
const roleFormSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(60),
  description: z.string().trim().max(300).optional(),
  area: z.enum(["staff", "client"]),
});

type FormValues = z.infer<typeof roleFormSchema>;

function grantsToRecord(
  grants: { permission: string; scope: string }[],
): Record<string, ScopeChoice> {
  const record: Record<string, ScopeChoice> = {};
  for (const grant of grants) record[grant.permission] = grant.scope as ScopeChoice;
  return record;
}

/**
 * Dialog buat role baru (tanpa prop `role`) atau ubah role (dengan `role`).
 *
 * Untuk role SISTEM: nama/deskripsi/area tidak bisa diedit (diatur kode),
 * hanya grant permission yang bisa diubah. Perubahan grant role sistem akan
 * HILANG saat `db:seed` / `db:sync-roles` dijalankan.
 */
export function RoleFormDialog({
  permissions,
  role,
}: {
  permissions: readonly string[];
  role?: RoleSummary;
}) {
  const isEdit = Boolean(role);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [grants, setGrants] = useState<Record<string, ScopeChoice>>(
    role ? grantsToRecord(role.grants) : {},
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: role?.name ?? "",
      description: role?.description ?? "",
      area: role?.area ?? "staff",
    },
  });

  function closeAndReset() {
    reset();
    setFormError(null);
    setOpen(false);
    router.refresh();
  }

  const createAction = useToastAction(createRoleAction, {
    onSuccess: closeAndReset,
    onError: ({ error }) => setFormError(error.serverError ?? "Gagal membuat role."),
  });
  const updateAction = useToastAction(updateRoleAction, {
    onSuccess: closeAndReset,
    onError: ({ error }) => setFormError(error.serverError ?? "Gagal mengubah role."),
  });

  function onSubmit(values: FormValues) {
    const grantList = Object.entries(grants)
      .filter((entry): entry is [string, "all" | "assigned" | "own"] => entry[1] !== "")
      .map(([permission, scope]) => ({ permission, scope }));

    if (isEdit && role) {
      updateAction.execute({
        roleId: role.id,
        name: values.name,
        description: values.description,
        grants: grantList,
      });
      return;
    }
    createAction.execute({ ...values, grants: grantList });
  }

  const isPending = createAction.isPending || updateAction.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button variant="outline" size="sm">
              Ubah
            </Button>
          ) : (
            <Button>
              <PlusIcon />
              Buat role
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isEdit ? `Ubah izin — ${role?.name}` : "Buat role baru"}</DialogTitle>
            <DialogDescription>
              {isEdit && role?.isSystem
                ? "⚠️ Role sistem — grant-nya ditentukan di kode. Perubahan lewat UI akan HILANG saat `db:seed` / `db:sync-roles` dijalankan. Nama/deskripsi tidak bisa diedit."
                : "Pilih scope tiap izin. Scope yang tidak didukung sebuah resource otomatis tidak memberi akses (fail-closed) — salah pilih tidak berbahaya."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nama</Label>
              <Input
                id="name"
                aria-invalid={!!errors.name}
                {...register("name")}
                disabled={role?.isSystem}
              />
              {errors.name ? (
                <p className="text-destructive text-xs">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Deskripsi</Label>
              <Input id="description" {...register("description")} disabled={role?.isSystem} />
            </div>

            {isEdit ? null : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="area">Area</Label>
                <Controller
                  control={control}
                  name="area"
                  render={({ field }) => (
                    <SelectField
                      id="area"
                      className="w-full"
                      options={[
                        { value: "staff", label: "Staf (/dashboard)" },
                        { value: "client", label: "Klien (/portal)" },
                      ]}
                      value={field.value ?? "staff"}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </div>
            )}

            <RolePermissionEditor
              permissions={permissions}
              value={grants}
              onChange={(p, s) => setGrants((g) => ({ ...g, [p]: s }))}
            />
          </div>

          <DialogFooter>
            {role?.isSystem ? (
              <p className="mr-auto text-muted-foreground text-xs">
                Perubahan akan hilang saat seed ulang.
              </p>
            ) : null}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Menyimpan…" : isEdit ? "Simpan" : "Buat role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
