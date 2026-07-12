import { describe, expect, it } from "vitest";
import { selectStorageDriverName } from "@/lib/storage";

/**
 * Phase 4 brief, required test: with the R2 env vars absent (this dev
 * environment never sets them), the local driver must be selected. If the
 * fallback logic in `selectStorageDriverName` is removed or inverted, this
 * fails.
 */
describe("storage driver selection", () => {
  it("selects the local driver when R2 env vars are absent", () => {
    expect(selectStorageDriverName()).toBe("local");
  });
});
