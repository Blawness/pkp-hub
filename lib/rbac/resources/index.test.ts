import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  isPermission,
  PERMISSIONS,
  RESOURCES,
  resourceOf,
  type ScopedPermission,
} from "@/lib/rbac/resources";

/**
 * Assertion tipe, dicek `pnpm typecheck` bukan saat runtime.
 *
 * `ScopedPermission` gampang runtuh jadi `never` tanpa ada yang sadar —
 * `defineResource` harus mempertahankan bentuk literal-nya supaya resource
 * tanpa tabel benar-benar kehilangan key `table`. Kalau itu rusak, baris
 * pertama gagal compile dan dua `@ts-expect-error` di bawah jadi "unused".
 */
const _scopedOk: ScopedPermission[] = ["project.read", "payment.void", "document.share"];
// @ts-expect-error resource tanpa tabel tidak boleh jadi ScopedPermission
const _profileNotScoped: ScopedPermission = "profile.updateOwn";
// @ts-expect-error resource tanpa tabel tidak boleh jadi ScopedPermission
const _reportNotScoped: ScopedPermission = "report.export";

describe("registry resource", () => {
  it("memuat 11 resource", () => {
    expect(Object.keys(RESOURCES)).toHaveLength(11);
  });

  it("nama kunci registry sama dengan nama resource-nya", () => {
    for (const [key, resource] of Object.entries(RESOURCES)) {
      expect(resource.name).toBe(key);
    }
  });

  it("setiap permission unik dan berbentuk resource.action", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    for (const permission of PERMISSIONS) {
      expect(permission.split(".")).toHaveLength(2);
    }
  });

  it("mengenali permission yang ada di katalog", () => {
    expect(isPermission("project.read")).toBe(true);
    expect(isPermission("document.share")).toBe(true);
    expect(isPermission("project.raed")).toBe(false);
    expect(isPermission("nonsense")).toBe(false);
  });

  it("resourceOf mengembalikan resource pemilik permission", () => {
    expect(resourceOf("payment.void").name).toBe("payment");
  });

  it("setiap resource bertabel mendefinisikan scope 'all'", () => {
    for (const resource of Object.values(RESOURCES)) {
      if (!resource.table) continue;
      expect(resource.scopes?.all, `${resource.name} tanpa scope all`).toBeTypeOf("function");
    }
  });

  it("resource tanpa tabel tidak mendefinisikan scope sama sekali", () => {
    for (const resource of Object.values(RESOURCES)) {
      if (resource.table) continue;
      expect(resource.scopes, `${resource.name}`).toBeUndefined();
    }
  });

  it("setiap fields resource menggating kolom nyata dengan permission resource yang sama", () => {
    for (const resource of Object.values(RESOURCES)) {
      if (!resource.fields) continue;
      const columns = resource.table ? Object.keys(getTableColumns(resource.table.table)) : [];
      for (const [column, permission] of Object.entries(resource.fields)) {
        // Kolom yang digating harus benar-benar ada di tabel.
        expect(columns, `${resource.name}.fields.${column}`).toContain(column);
        // Gate harus permission milik resource yang sama (batas tipe engine).
        expect(permission, `${resource.name}.fields.${column}`).toMatch(
          new RegExp(`^${resource.name}\\.`),
        );
        expect(resource.permissions as readonly string[], permission).toContain(permission);
      }
    }
  });
});
