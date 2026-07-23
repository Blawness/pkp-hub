import { PageHeader } from "@/components/dashboard/page-header";
import { ProfileForm } from "@/components/profile/profile-form";
import { userHasCredential } from "@/lib/actions/users-logic";
import { requireUser } from "@/lib/auth-guards";

export const metadata = { title: "Profil Saya" };

/**
 * Profil staf. Sengaja TIDAK di bawah /dashboard/settings — layout di sana
 * digerbangi `user.read` (admin-only), yang akan menolak surveyor dari halaman profilnya sendiri.
 *
 * Gerbang areanya sudah dipasang layout /dashboard; `requireUser` di
 * sini hanya untuk mengambil user-nya.
 */
export default async function DashboardProfilePage() {
  const user = await requireUser();
  const hasPassword = await userHasCredential(user.id);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader title="Profil Saya" description="Ubah nama dan password akun Anda." />
      <ProfileForm user={user} hasPassword={hasPassword} />
    </main>
  );
}
