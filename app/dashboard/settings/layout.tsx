import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth-guards";

/**
 * Gerbang sesungguhnya untuk seluruh area Pengaturan: admin saja.
 *
 * Menyembunyikan tautan "Pengaturan" dari sidebar surveyor BUKAN pengamanan —
 * surveyor tetap bisa mengetik URL-nya. Inilah yang menolaknya, dan ia menolak
 * setiap route di bawah /dashboard/settings sekaligus, jadi halaman baru yang
 * ditambahkan nanti terlindungi sejak lahir tanpa perlu ingat memasang guard.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
