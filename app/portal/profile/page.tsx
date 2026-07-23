import { ProfileForm } from "@/components/profile/profile-form";
import { userHasCredential } from "@/lib/actions/users-logic";
import { requireUser } from "@/lib/auth-guards";

export const metadata = { title: "Profil Saya" };

/** Profil klien. Gerbang areanya sudah dipasang layout /portal. */
export default async function PortalProfilePage() {
  const user = await requireUser();
  const hasPassword = await userHasCredential(user.id);

  return (
    <main className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-medium">Profil Saya</h1>
        <p className="text-sm text-muted-foreground">Ubah nama dan password akun Anda.</p>
      </div>
      <ProfileForm user={user} hasPassword={hasPassword} />
    </main>
  );
}
