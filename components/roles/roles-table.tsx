"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { RoleFormDialog } from "@/components/roles/role-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteRoleAction } from "@/lib/actions/roles";
import type { RoleSummary } from "@/lib/actions/roles-logic";
import { useToastAction } from "@/lib/hooks/use-toast-action";

export function RolesTable({
  roles,
  permissions,
}: {
  roles: RoleSummary[];
  /** Katalog permission dialirkan dari RSC — lihat `RolePermissionEditor`. */
  permissions: readonly string[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();
  const { executeAsync } = useToastAction(deleteRoleAction);

  async function handleDelete(roleId: string): Promise<{ error?: string } | undefined> {
    const result = await executeAsync({ roleId });
    if (result?.serverError) return { error: result.serverError };
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <RoleFormDialog permissions={permissions} />
      </div>
      <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Izin</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                // Fragment-lah elemen array-nya, jadi key harus di sini —
                // bukan di TableRow di dalamnya.
                <Fragment key={role.id}>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {role.name}
                        {role.isSystem ? <Badge variant="outline">Sistem</Badge> : null}
                      </div>
                      {role.description ? (
                        <p className="text-muted-foreground text-xs">{role.description}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{role.area}</TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setExpandedId(expandedId === role.id ? null : role.id)}
                      >
                        {role.grants.length} izin
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <RoleFormDialog permissions={permissions} role={role} />
                        {role.isSystem ? null : (
                          <ConfirmDialog
                            trigger={
                              <Button variant="outline" size="sm">
                                Hapus
                              </Button>
                            }
                            title={`Hapus role "${role.name}"?`}
                            description="User yang punya role ini kehilangan izin yang berasal darinya. Tindakan ini tidak bisa dibatalkan."
                            confirmLabel="Hapus"
                            confirmVariant="destructive"
                            onConfirm={() => handleDelete(role.id)}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === role.id ? (
                    <TableRow>
                      <TableCell colSpan={4} className="bg-muted/30">
                        {role.grants.length === 0 ? (
                          <p className="py-2 text-muted-foreground text-sm">Belum ada izin.</p>
                        ) : (
                          <ul className="flex flex-wrap gap-2 py-2">
                            {role.grants.map((grant) => (
                              <li key={grant.permission}>
                                <Badge variant="secondary">
                                  {grant.permission} ({grant.scope})
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
