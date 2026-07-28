import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";

/**
 * Gerbang sesungguhnya untuk seluruh area Pengaturan: `user.read`
 * (admin/superuser di matrix).
 *
 * Menyembunyikan tautan "Pengaturan" dari sidebar surveyor BUKAN pengamanan —
 * surveyor tetap bisa mengetik URL-nya. Inilah yang menolaknya, dan ia menolak
 * setiap route di bawah /dashboard/settings sekaligus, jadi halaman baru yang
 * ditambahkan nanti terlindungi sejak lahir tanpa perlu ingat memasang guard.
 *
 * Tab "Peran" digerbangi TERPISAH di sini (`role.read`) karena admin punya
 * `user.read` tapi bukan `role.*` — kalau tidak, admin biasa akan melihat tab
 * yang menuju halaman yang toh akan menolaknya.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await getRbacContext();
  if (!can(ctx, "user.read")) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-6 pt-6 sm:px-8">
        <SettingsTabs showRoles={can(ctx, "role.read")} />
      </div>
      {children}
    </div>
  );
}
