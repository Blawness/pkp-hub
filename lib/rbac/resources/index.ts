import type { AnyResource } from "../define-resource";
import { auditResource } from "./audit";
import { backupResource } from "./backup";
import { clientResource } from "./client";
import { commentResource } from "./comment";
import { documentResource } from "./document";
import { equipmentResource } from "./equipment";
import { equipmentItemResource } from "./equipment-item";
import { mapResource } from "./map";
import { notificationResource } from "./notification";
import { paymentResource } from "./payment";
import { phaseResource } from "./phase";
import { profileResource } from "./profile";
import { projectResource } from "./project";
import { reportResource } from "./report";
import { roleResource } from "./role";
import { searchResource } from "./search";
import { sessionResource } from "./session";
import { settingsResource } from "./settings";
import { storageResource } from "./storage";
import { userResource } from "./user";

/**
 * Registry seluruh resource. MENAMBAH FITUR = menambah satu file di folder
 * ini lalu mendaftarkannya di sini. Tidak ada file engine lain yang perlu
 * disentuh, dan tipe `Permission` ikut bertambah dengan sendirinya.
 */
export const RESOURCES = {
  audit: auditResource,
  backup: backupResource,
  client: clientResource,
  comment: commentResource,
  document: documentResource,
  equipment: equipmentResource,
  equipmentItem: equipmentItemResource,
  map: mapResource,
  notification: notificationResource,
  payment: paymentResource,
  phase: phaseResource,
  profile: profileResource,
  project: projectResource,
  report: reportResource,
  role: roleResource,
  search: searchResource,
  session: sessionResource,
  settings: settingsResource,
  storage: storageResource,
  user: userResource,
} as const;

export type ResourceName = keyof typeof RESOURCES;

/** Union seluruh permission. Typo seperti "project.raed" gagal saat compile. */
export type Permission = {
  [K in ResourceName]: (typeof RESOURCES)[K]["permissions"][number];
}[ResourceName];

/**
 * Permission milik resource yang punya tabel — satu-satunya yang boleh masuk
 * ke `rbacFilter` / `requireScopedRow`. Memakai `profile.updateOwn` di sana
 * adalah error tipe, bukan error runtime.
 */
export type ScopedPermission = {
  [K in ResourceName]: (typeof RESOURCES)[K] extends { table: object }
    ? (typeof RESOURCES)[K]["permissions"][number]
    : never;
}[ResourceName];

export const PERMISSIONS: readonly Permission[] = Object.values(RESOURCES).flatMap(
  (resource) => resource.permissions as readonly Permission[],
);

const PERMISSION_SET = new Set<string>(PERMISSIONS);

// Registry divalidasi SEKALI saat modul dimuat, bukan tiap request: nama
// resource ganda harus meledak saat start, bukan diam-diam menimpa entri lain.
if (PERMISSION_SET.size !== PERMISSIONS.length) {
  throw new Error("rbac: ada permission ganda di registry.");
}
for (const [key, resource] of Object.entries(RESOURCES)) {
  if (resource.name !== key) {
    throw new Error(`rbac: kunci registry "${key}" tidak cocok dengan nama "${resource.name}".`);
  }
}

/** Apakah string ini permission yang dikenal katalog? Dipakai fail-closed. */
export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

const BY_RESOURCE_NAME = RESOURCES as unknown as Record<string, AnyResource>;

/** Resource pemilik sebuah permission. */
export function resourceOf(permission: Permission): AnyResource {
  const [name] = permission.split(".");
  const resource = BY_RESOURCE_NAME[name];
  if (!resource) throw new Error(`rbac: resource "${name}" tidak terdaftar.`);
  return resource;
}
