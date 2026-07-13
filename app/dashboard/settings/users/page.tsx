import { PageHeader } from "@/components/dashboard/page-header";
import { CreateStaffDialog } from "@/components/users/create-staff-dialog";
import { UsersTable } from "@/components/users/users-table";
import { listUsers } from "@/lib/actions/users-logic";
import { requireAdmin } from "@/lib/auth-guards";

export const metadata = { title: "Manajemen User" };

/**
 * Manajemen user (admin-only; digerbangi oleh `settings/layout.tsx`).
 *
 * Menutup celah nyata: sebelum halaman ini ada, akun staf HANYA bisa lahir dari
 * `lib/db/seed.ts` — tidak ada jalan di aplikasi untuk menambah admin atau
 * surveyor, karena `disableSignUp: true` mematikan pendaftaran mandiri dan alur
 * undangan yang ada hanya membuat akun klien.
 */
export default async function UsersPage() {
  const user = await requireAdmin();
  const rows = await listUsers();

  const activeAdminCount = rows.filter((u) => u.role === "admin" && !u.archivedAt).length;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Manajemen User"
        description="Kelola akun staf studio. Akun klien dibuat lewat halaman Klien."
        action={<CreateStaffDialog />}
      />

      <UsersTable rows={rows} currentUserId={user.id} activeAdminCount={activeAdminCount} />
    </main>
  );
}
