import { describe, expect, it } from "vitest";
import { redact } from "@/lib/rbac/fields";
import { demoGuardResource, fakeContext } from "@/lib/rbac/test-fixtures";

describe("redact", () => {
  const row = { id: "p1", title: "Proyek A", projectValue: 5_000_000 };

  it("membuang field yang tidak boleh dilihat", () => {
    const ctx = fakeContext({});
    const result = redact(ctx, demoGuardResource, row);
    expect(result).toEqual({ id: "p1", title: "Proyek A" });
    expect("projectValue" in result).toBe(false);
  });

  it("mempertahankan field kalau izinnya ada", () => {
    const ctx = fakeContext({ "demo.readFinance": "all" });
    expect(redact(ctx, demoGuardResource, row)).toEqual(row);
  });

  it("tidak mengubah baris aslinya", () => {
    const ctx = fakeContext({});
    redact(ctx, demoGuardResource, row);
    expect(row.projectValue).toBe(5_000_000);
  });
});
