import type { LucideIcon } from "lucide-react";
import { FileTextIcon, FolderKanbanIcon, LayoutDashboardIcon, UsersIcon } from "lucide-react";
import type { Role } from "@/lib/auth-guards";

/**
 * Nama cookie penyimpan kondisi ciut sidebar.
 *
 * Tinggal di modul netral ini — BUKAN di `sidebar.tsx` — karena file itu
 * ber-"use client". Konstanta yang diekspor dari modul klien lalu diimpor oleh
 * Server Component tidak sampai sebagai nilai aslinya; yang diterima server
 * adalah referensi klien, sehingga `cookies().get(...)` mencari nama yang salah
 * dan selalu mengembalikan undefined — sidebar pun lupa pilihan penggunanya di
 * setiap muat ulang, tanpa satu pun error yang muncul.
 */
export const SIDEBAR_COOKIE = "pkp_sidebar_collapsed";

export type NavLink = {
  /** Segmen route pertama di bawah /dashboard; `null` untuk /dashboard sendiri. */
  segment: string | null;
  href: string;
  label: string;
  icon: LucideIcon;
};

/**
 * Sumber tunggal navigasi staf, dipakai bersama oleh sidebar (desktop), laci
 * mobile, dan breadcrumb topbar — supaya ketiganya tidak bisa saling melenceng.
 *
 * Aturan role di sini adalah cermin UI dari batas yang sebenarnya: "Klien"
 * disembunyikan dari surveyor, tapi yang benar-benar menjaga adalah guard di
 * server (`requireAdmin` pada route klien). Menyembunyikan tautan bukan
 * pengamanan; ini hanya supaya surveyor tidak ditawari pintu yang terkunci.
 */
export function buildLinks(role: Role): NavLink[] {
  const links: NavLink[] = [
    { segment: null, href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
    { segment: "projects", href: "/dashboard/projects", label: "Proyek", icon: FolderKanbanIcon },
    { segment: "documents", href: "/dashboard/documents", label: "Dokumen", icon: FileTextIcon },
  ];

  if (role === "admin") {
    links.push({ segment: "clients", href: "/dashboard/clients", label: "Klien", icon: UsersIcon });
  }

  return links;
}
