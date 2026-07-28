import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { RolesTable } from "@/components/roles/roles-table";
import { listRoles } from "@/lib/actions/roles-logic";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/resources";

export const metadata = { title: "Manajemen Role" };

/**
 * Manajemen role (superuser-only; `settings/layout.tsx` hanya menggerbangi
 * `user.read`, jadi permission `role.read` yang lebih sempit dicek eksplisit
 * di sini — pola yang sama dengan halaman lain di bawah /settings yang
 * butuh permission berbeda dari gerbang layout-nya).
 */
export default async function RolesPage() {
  const ctx = await getRbacContext();
  if (!can(ctx, "role.read")) redirect("/dashboard/settings/users");

  const roleRows = await listRoles(ctx);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Manajemen Role"
        description="Role sistem ditentukan di kode dan tidak bisa diubah dari sini. Buat role kustom untuk kebutuhan lain."
      />
      {/* Katalog permission dialirkan sebagai data: mengimpornya dari komponen
          client akan menyeret tabel Drizzle (dan `pg`) ke bundle browser. */}
      <RolesTable roles={roleRows} permissions={PERMISSIONS} />
    </main>
  );
}
