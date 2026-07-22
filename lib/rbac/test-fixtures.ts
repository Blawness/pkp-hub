import type { SessionUser } from "@/lib/auth-guards";
import { getClientIdForUser } from "@/lib/auth-guards";
import { projects } from "@/lib/db/schema";
import { loadEffectivePermissions } from "./context";
import { defineResource } from "./define-resource";
import type { RbacContext, Scope } from "./types";

const FIXTURE_USER: SessionUser = {
  id: "fixture-user",
  name: "Fixture User",
  email: "fixture@fixture.test",
  role: "surveyor",
};

/**
 * Konteks RBAC buatan untuk unit test — tidak menyentuh DB dan tidak
 * bergantung pada seed. Dipakai untuk menguji engine, bukan data.
 */
export function fakeContext(
  grants: Record<string, Scope>,
  overrides: Partial<RbacContext> = {},
): RbacContext {
  return {
    user: FIXTURE_USER,
    permissions: new Map(Object.entries(grants)),
    clientId: null,
    ...overrides,
  };
}

/**
 * `RbacContext` untuk test yang memuat permission efektif SUNGGUHAN dari DB
 * (`loadEffectivePermissions`) — bukan map buatan tangan seperti
 * `fakeContext` — jadi test domain otomatis mewarisi parity dengan produksi.
 * Pasangan test dari `getRbacContext()`, minus `requireUser()` yang butuh
 * request scope. Prasyarat: role sudah di-seed & di-backfill (`seedSystemRoles`
 * + `backfillUserRoles`) untuk user ini.
 */
export async function makeTestContextForUser(user: SessionUser): Promise<RbacContext> {
  const [permissions, clientId] = await Promise.all([
    loadEffectivePermissions(user.id),
    getClientIdForUser(user.id),
  ]);
  return { user, permissions, clientId };
}

/**
 * Resource fixture untuk menguji `guards` dan `fields`.
 *
 * Sengaja TIDAK didaftarkan ke registry: resource nyata belum boleh memakai
 * kedua fitur itu di sub-proyek 1 (mengisinya mengubah perilaku), tapi
 * engine-nya tetap harus terbukti bekerja.
 */
export const demoGuardResource = defineResource({
  name: "demo",
  actions: ["update", "readFinance"],
  table: { table: projects, id: projects.id },
  guards: {
    update: (row) =>
      row.status === "selesai" ? "Proyek yang sudah selesai tidak bisa diubah." : true,
  },
  // `projectValue`, bukan `contractValue`: `fields` diketik terhadap kolom
  // tabelnya, jadi nama yang tidak ada gagal saat compile — persis yang
  // diinginkan.
  fields: { projectValue: "demo.readFinance" },
});
