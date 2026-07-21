import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { assertCan, can, scopeOf } from "@/lib/rbac/can";
import { rbacFilter } from "@/lib/rbac/filter";
import { fakeContext } from "@/lib/rbac/test-fixtures";

/** SQL yang dihasilkan filter, sebagai string — cukup untuk membedakan
 *  `true` / `false` / predikat sungguhan tanpa menyentuh DB. */
function sqlOf(query: { toSQL: () => { sql: string } }): string {
  return query.toSQL().sql;
}

function filterSql(ctx: Parameters<typeof rbacFilter>[0], permission: "project.read"): string {
  return sqlOf(db.select().from(projects).where(rbacFilter(ctx, permission)));
}

describe("can / scopeOf / assertCan", () => {
  it("true hanya kalau izinnya ada", () => {
    const ctx = fakeContext({ "project.read": "assigned" });
    expect(can(ctx, "project.read")).toBe(true);
    expect(can(ctx, "project.update")).toBe(false);
  });

  it("scopeOf mengembalikan null kalau tidak ada grant", () => {
    const ctx = fakeContext({ "project.read": "own" });
    expect(scopeOf(ctx, "project.read")).toBe("own");
    expect(scopeOf(ctx, "payment.void")).toBeNull();
  });

  it("assertCan melempar pesan berbahasa Indonesia", () => {
    const ctx = fakeContext({});
    expect(() => assertCan(ctx, "project.create")).toThrow(/tidak punya izin/i);
  });
});

describe("rbacFilter", () => {
  it("scope all menghasilkan predikat true", () => {
    const ctx = fakeContext({ "project.read": "all" });
    expect(filterSql(ctx, "project.read")).toMatch(/where true/i);
  });

  it("tanpa izin menghasilkan predikat false, bukan error", () => {
    const ctx = fakeContext({});
    expect(filterSql(ctx, "project.read")).toMatch(/where false/i);
  });

  it("scope yang tidak didefinisikan resource-nya juga false (fail-closed)", () => {
    // `client` hanya mendefinisikan scope `all`.
    const ctx = fakeContext({ "client.read": "own" });
    const sqlText = sqlOf(db.select().from(projects).where(rbacFilter(ctx, "client.read")));
    expect(sqlText).toMatch(/where false/i);
  });

  it("scope own tanpa clientId menghasilkan false, bukan query uuid ngawur", () => {
    const ctx = fakeContext({ "project.read": "own" }, { clientId: null });
    expect(filterSql(ctx, "project.read")).toMatch(/where false/i);
  });

  it("scope own dengan clientId menghasilkan perbandingan client_id", () => {
    const ctx = fakeContext(
      { "project.read": "own" },
      { clientId: "11111111-1111-1111-1111-111111111111" },
    );
    expect(filterSql(ctx, "project.read")).toMatch(/client_id/i);
  });

  it("scope assigned menghasilkan subquery fase", () => {
    const ctx = fakeContext({ "project.read": "assigned" });
    const sqlText = filterSql(ctx, "project.read");
    expect(sqlText).toMatch(/assigned_surveyor_id/i);
    expect(sqlText).toMatch(/exists/i);
  });
});
