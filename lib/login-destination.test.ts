import { describe, expect, it } from "vitest";
import { loginDestination, sanitizeRedirectTo } from "@/lib/login-destination";

/**
 * Logika "user sudah ber-sesi mendarat di /login, mau dikirim ke mana" dipakai
 * dua arah: submit form login (LoginForm) DAN bounce server-side di
 * `app/login/page.tsx` (bug: Chrome meng-autocomplete
 * /login?redirectTo=%2Fdashboard%2Fequipment, user ber-sesi malah disuguhi
 * form login lagi). Keduanya harus memakai fungsi yang sama supaya tidak
 * pernah beda pendapat soal sanitasi maupun batas area per-role.
 */
describe("sanitizeRedirectTo", () => {
  it("meloloskan path relatif same-app", () => {
    expect(sanitizeRedirectTo("/dashboard/equipment")).toBe("/dashboard/equipment");
  });

  it("menolak URL absolut", () => {
    expect(sanitizeRedirectTo("https://evil.com")).toBeNull();
  });

  it("menolak URL protocol-relative", () => {
    expect(sanitizeRedirectTo("//evil.com")).toBeNull();
  });

  it("menolak trik backslash", () => {
    expect(sanitizeRedirectTo("/\\evil.com")).toBeNull();
  });

  it("menolak nilai kosong", () => {
    expect(sanitizeRedirectTo(null)).toBeNull();
    expect(sanitizeRedirectTo("")).toBeNull();
  });
});

describe("loginDestination", () => {
  it("menghormati redirectTo yang berada di area role-nya", () => {
    expect(loginDestination("admin", "/dashboard/equipment")).toBe("/dashboard/equipment");
    expect(loginDestination("client", "/portal/projects/abc")).toBe("/portal/projects/abc");
  });

  it("menolak redirectTo lintas area — client tidak boleh dikirim ke /dashboard", () => {
    expect(loginDestination("client", "/dashboard/equipment")).toBe("/portal");
    expect(loginDestination("surveyor", "/portal/projects/abc")).toBe("/dashboard");
  });

  it("jatuh ke home role saat redirectTo tidak ada atau tidak aman", () => {
    expect(loginDestination("admin", null)).toBe("/dashboard");
    expect(loginDestination("client", "https://evil.com")).toBe("/portal");
  });
});
