"use client";

import { SelectField } from "@/components/ui/select-field";

export type ScopeChoice = "" | "all" | "assigned" | "own";

const SCOPE_OPTIONS = [
  { value: "", label: "Tidak diberikan" },
  { value: "all", label: "Semua (all)" },
  { value: "assigned", label: "Ditugaskan (assigned)" },
  { value: "own", label: "Milik sendiri (own)" },
];

function groupByResource(permissions: readonly string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const permission of permissions) {
    const [resource] = permission.split(".");
    groups[resource] ??= [];
    groups[resource].push(permission);
  }
  return groups;
}

/**
 * Editor grant per permission, dikelompokkan per resource. Scope yang tidak
 * didukung sebuah resource (mis. resource tanpa tabel hanya punya makna
 * "diberikan atau tidak") tetap fail-closed di engine — salah pilih di sini
 * paling buruk berarti izin itu tidak berlaku, bukan lubang keamanan.
 *
 * `permissions` DIOPER sebagai prop, bukan diimpor dari `@/lib/rbac/resources`:
 * tiap file resource mengimpor tabel Drizzle-nya, jadi mengimpor katalog dari
 * komponen client akan menyeret `lib/db` — dan `pg` — ke bundle browser.
 * Katalognya cuma daftar string, jadi dialirkan dari Server Component.
 */
export function RolePermissionEditor({
  permissions,
  value,
  onChange,
}: {
  permissions: readonly string[];
  value: Record<string, ScopeChoice>;
  onChange: (permission: string, scope: ScopeChoice) => void;
}) {
  const groups = groupByResource(permissions);

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(groups).map(([resource, resourcePermissions]) => (
        <div key={resource} className="flex flex-col gap-2">
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            {resource}
          </p>
          {resourcePermissions.map((permission) => (
            <div key={permission} className="grid grid-cols-2 items-center gap-2">
              <span className="truncate text-sm">{permission}</span>
              <SelectField
                aria-label={permission}
                className="w-full"
                options={SCOPE_OPTIONS}
                value={value[permission] ?? ""}
                onValueChange={(v) => onChange(permission, v as ScopeChoice)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
