"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assignRoleAction, unassignRoleAction } from "@/lib/actions/roles";
import type { AssignableUser, RoleAssignment } from "@/lib/actions/roles-logic";
import { useToastAction } from "@/lib/hooks/use-toast-action";

/**
 * Cermin client-side dari `assignRoleSchema`. Sengaja tidak mengimpor
 * `roles-schemas.ts`: schema itu menarik katalog RBAC, yang menarik tabel
 * Drizzle dan `pg` ke bundle browser. Server tetap memvalidasi dengan schema
 * aslinya.
 */
const assignFormSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
});

type FormValues = z.infer<typeof assignFormSchema>;

/**
 * Role EKSTRA saja — role dasar (Admin/Surveyor/Klien) diatur di halaman
 * User lewat "Ganti role". Panel ini untuk hal seperti menjadikan seorang
 * admin juga Superuser, atau memberi role kustom ke user tertentu.
 */
export function RoleAssignmentsPanel({
  assignments,
  assignableRoles,
  assignableUsers,
}: {
  assignments: RoleAssignment[];
  assignableRoles: { id: string; name: string }[];
  assignableUsers: AssignableUser[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(assignFormSchema),
    defaultValues: { userId: "", roleId: "" },
  });

  const assign = useToastAction(assignRoleAction, {
    onSuccess: () => {
      reset({ userId: "", roleId: "" });
      setFormError(null);
      router.refresh();
    },
    onError: ({ error }) => setFormError(error.serverError ?? "Gagal menambah role."),
  });

  const { executeAsync: unassign } = useToastAction(unassignRoleAction);

  async function handleUnassign(userId: string, roleId: string) {
    const result = await unassign({ userId, roleId });
    // Mencabut role dari diri sendiri ditolak server — tanpa ini, tombolnya
    // terlihat tidak melakukan apa-apa.
    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    setFormError(null);
    router.refresh();
  }

  if (assignableRoles.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-heading font-semibold text-lg">Role tambahan</h2>
      <p className="text-muted-foreground text-sm">
        Role dasar (Admin/Surveyor/Klien) diatur di halaman User. Di sini hanya untuk role EKSTRA di
        atasnya, misalnya menjadikan seorang admin juga Superuser.
      </p>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={handleSubmit((values) => assign.execute(values))}
      >
        {formError ? (
          <p role="alert" className="w-full text-destructive text-sm">
            {formError}
          </p>
        ) : null}

        <Controller
          control={control}
          name="userId"
          render={({ field }) => (
            <SelectField
              aria-label="User"
              className="w-64"
              options={assignableUsers.map((u) => ({
                value: u.id,
                label: `${u.name} (${u.email})`,
              }))}
              value={field.value ?? ""}
              onValueChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="roleId"
          render={({ field }) => (
            <SelectField
              aria-label="Role"
              className="w-48"
              options={assignableRoles.map((r) => ({ value: r.id, label: r.name }))}
              value={field.value ?? ""}
              onValueChange={field.onChange}
            />
          )}
        />
        <Button type="submit" disabled={assign.isPending}>
          {assign.isPending ? "Menyimpan…" : "Tambah"}
        </Button>
        {errors.userId || errors.roleId ? (
          <p className="w-full text-destructive text-xs">Pilih user dan role.</p>
        ) : null}
      </form>

      <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Belum ada role tambahan yang diberikan.
                </TableCell>
              </TableRow>
            ) : (
              assignments.map((a) => (
                <TableRow key={`${a.userId}-${a.roleId}`}>
                  <TableCell>
                    {a.userName} <span className="text-muted-foreground">({a.userEmail})</span>
                  </TableCell>
                  <TableCell>
                    <Badge>{a.roleName}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnassign(a.userId, a.roleId)}
                    >
                      Cabut
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
