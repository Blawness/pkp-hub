import { expect, test, vi } from "vitest";

// Palsukan getRbacContext agar tak butuh request scope (next/headers).
vi.mock("@/lib/rbac/context", () => ({
  getRbacContext: async () => ({
    user: { id: "u1", name: "x", email: "x@x.dev", role: "admin" },
    permissions: new Map([["client.create", "all"]]),
    clientId: null,
  }),
}));

const { rbacActionClient } = await import("@/lib/actions/safe-action");

test("fail-closed: action tanpa metadata.permission tidak pernah sukses", async () => {
  // Metadata sengaja dihilangkan — di produksi ini juga error tipe; di sini
  // dicast untuk membuktikan gerbang runtime-nya menolak.
  // biome-ignore lint/suspicious/noExplicitAny: menguji fail-closed saat metadata absen.
  const action = (rbacActionClient as any).action(async () => "ok");
  const res = await action();
  expect(res?.data).toBeUndefined();
  expect(res?.serverError).toBeTruthy();
});

test("menjalankan action saat izin dimiliki", async () => {
  const action = rbacActionClient.metadata({ permission: "client.create" }).action(async () => "ok");
  const res = await action();
  expect(res?.data).toBe("ok");
});

test("menolak dengan pesan saat izin tak dimiliki", async () => {
  const action = rbacActionClient.metadata({ permission: "user.archive" }).action(async () => "ok");
  const res = await action();
  expect(res?.data).toBeUndefined();
  expect(res?.serverError).toMatch(/tidak punya izin/i);
});
