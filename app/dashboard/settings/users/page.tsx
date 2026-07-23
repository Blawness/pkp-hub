import { PageHeader } from "@/components/dashboard/page-header";
import { CreateClientDialog } from "@/components/users/create-client-dialog";
import { CreateStaffDialog } from "@/components/users/create-staff-dialog";
import { UsersTable } from "@/components/users/users-table";
import { listUsers } from "@/lib/actions/users-logic";
import { getRbacContext } from "@/lib/rbac/context";

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
  // Gerbang `user.read` hidup di `settings/layout.tsx`; di sini hanya butuh
  // identitas pemanggil untuk menandai barisnya sendiri di tabel.
  const { user } = await getRbacContext();
  const rows = await listUsers();

  const activeAdminCount = rows.filter((u) => u.role === "admin" && !u.archivedAt).length;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Manajemen User"
        description="Kelola akun staf studio. Akun klien dibuat lewat 'Tambah klien' di sini, atau diundang dari halaman Klien."
        action={
          <div className="flex gap-2">
            <CreateStaffDialog />
            <CreateClientDialog />
          </div>
        }
      />

      <UsersTable rows={rows} currentUserId={user.id} activeAdminCount={activeAdminCount} />
    </main>
  );
}
