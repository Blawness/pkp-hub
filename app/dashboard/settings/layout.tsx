import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";

/**
 * Gerbang sesungguhnya untuk seluruh area Pengaturan: `user.read`
 * (admin-only di matrix).
 *
 * Menyembunyikan tautan "Pengaturan" dari sidebar surveyor BUKAN pengamanan —
 * surveyor tetap bisa mengetik URL-nya. Inilah yang menolaknya, dan ia menolak
 * setiap route di bawah /dashboard/settings sekaligus, jadi halaman baru yang
 * ditambahkan nanti terlindungi sejak lahir tanpa perlu ingat memasang guard.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await getRbacContext();
  if (!can(ctx, "user.read")) redirect("/dashboard");
  return <>{children}</>;
}
