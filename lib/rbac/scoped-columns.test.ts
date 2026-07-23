import { getTableColumns } from "drizzle-orm";
import { expect, test } from "vitest";
import { projects } from "@/lib/db/schema";
import { scopedColumns } from "@/lib/rbac/scoped-columns";
import { demoGuardResource, fakeContext } from "@/lib/rbac/test-fixtures";

// `demoGuardResource` bertabel `projects` dan meng-gating `projectValue` di
// balik `demo.readFinance` — cukup untuk menguji helper tanpa resource nyata.

test("menyertakan semua kolom saat ctx punya izin field", () => {
  const cols = scopedColumns(demoGuardResource, fakeContext({ "demo.readFinance": "all" }));
  expect(Object.keys(cols).sort()).toEqual(Object.keys(getTableColumns(projects)).sort());
});

test("membuang kolom sensitif saat ctx tak punya izinnya", () => {
  const cols = scopedColumns(demoGuardResource, fakeContext({}));
  expect(cols.projectValue).toBeUndefined();
  expect(cols.title).toBeDefined();
  expect(cols.id).toBeDefined();
});

test("melempar untuk resource tanpa tabel", () => {
  const noTable = { name: "x", actions: [], permissions: [], fields: {} } as never;
  expect(() => scopedColumns(noTable, fakeContext({}))).toThrow(/tidak punya tabel/);
});
