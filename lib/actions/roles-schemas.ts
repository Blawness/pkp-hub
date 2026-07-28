import { z } from "zod";
import { isPermission } from "@/lib/rbac/resources";
import { SCOPES } from "@/lib/rbac/types";

/**
 * `permission` divalidasi lewat `isPermission` (bukan `z.enum(PERMISSIONS)`)
 * karena `PERMISSIONS` adalah array runtime, bukan literal — `isPermission`
 * sudah jadi satu-satunya penjaga fail-closed untuk string permission di
 * seluruh engine (lihat `loadEffectivePermissions`), jadi dipakai ulang di
 * sini alih-alih menduplikasi daftarnya.
 */
const grantSchema = z.object({
  permission: z.string().refine(isPermission, "Permission tidak dikenal katalog."),
  scope: z.enum(SCOPES),
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(60),
  description: z.string().trim().max(300).optional(),
  area: z.enum(["staff", "client"]),
  grants: z.array(grantSchema).max(200),
});

export const updateRoleSchema = z.object({
  roleId: z.uuid(),
  name: z.string().trim().min(1, "Nama wajib diisi.").max(60),
  description: z.string().trim().max(300).optional(),
  grants: z.array(grantSchema).max(200),
});

export const deleteRoleSchema = z.object({
  roleId: z.uuid(),
});

export const assignRoleSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
});

export const unassignRoleSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
});
