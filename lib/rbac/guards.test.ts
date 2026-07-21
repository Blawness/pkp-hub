import { describe, expect, it } from "vitest";
import { checkGuard } from "@/lib/rbac/scoped-row";
import { demoGuardResource } from "@/lib/rbac/test-fixtures";

describe("checkGuard", () => {
  it("melewatkan baris yang lolos kondisi", () => {
    expect(() => checkGuard(demoGuardResource, "update", { status: "berjalan" })).not.toThrow();
  });

  it("melempar pesan penolakan guard apa adanya", () => {
    expect(() => checkGuard(demoGuardResource, "update", { status: "selesai" })).toThrow(
      "Proyek yang sudah selesai tidak bisa diubah.",
    );
  });

  it("action tanpa guard selalu lolos", () => {
    expect(() => checkGuard(demoGuardResource, "readFinance", { status: "selesai" })).not.toThrow();
  });
});
