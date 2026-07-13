import { describe, expect, it } from "vitest";
import { homeForRole } from "@/lib/auth-guards";

/**
 * Pemetaan role -> area ini dipakai di dua tempat: guard `requireRole()` dan
 * redirect di `app/page.tsx`. Kalau pemetaannya berubah diam-diam, staf bisa
 * mendarat di portal klien (atau sebaliknya) — test ini yang menahannya.
 */
describe("homeForRole", () => {
  it("mengirim owner ke dashboard staf", () => {
    expect(homeForRole("owner")).toBe("/dashboard");
  });

  it("mengirim surveyor ke dashboard staf", () => {
    expect(homeForRole("surveyor")).toBe("/dashboard");
  });

  it("mengirim client ke portal klien", () => {
    expect(homeForRole("client")).toBe("/portal");
  });
});
