import type { LucideIcon } from "lucide-react";
import {
  FileTextIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import type { Permission } from "@/lib/rbac/resources";

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
  /** Izin yang mensyaratkan tautan ini tampil; tanpa izin = selalu tampil. */
  permission?: Permission;
};

/** Predikat izin — di klien datang dari `usePermissions().can`. */
export type CanFn = (permission: Permission) => boolean;

/**
 * Sumber tunggal navigasi staf, dipakai bersama oleh sidebar (desktop), laci
 * mobile, dan breadcrumb topbar — supaya ketiganya tidak bisa saling melenceng.
 *
 * Tiap entri disaring `permission`-nya, bukan role: cermin UI dari batas yang
 * sebenarnya. Yang benar-benar menjaga adalah server (`rbacActionClient`,
 * `rbacFilter`). Menyembunyikan tautan bukan pengamanan; ini hanya supaya
 * surveyor tidak ditawari pintu yang terkunci.
 */
export function buildLinks(can: CanFn): NavLink[] {
  const links: NavLink[] = [
    { segment: null, href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
    {
      segment: "projects",
      href: "/dashboard/projects",
      label: "Proyek",
      icon: FolderKanbanIcon,
      permission: "project.read",
    },
    {
      segment: "documents",
      href: "/dashboard/documents",
      label: "Dokumen",
      icon: FileTextIcon,
      permission: "document.read",
    },
    {
      segment: "equipment",
      href: "/dashboard/equipment",
      label: "Inventaris",
      icon: WrenchIcon,
      permission: "equipment.read",
    },
    {
      segment: "clients",
      href: "/dashboard/clients",
      label: "Klien",
      icon: UsersIcon,
      permission: "client.read",
    },
    {
      segment: "settings",
      href: "/dashboard/settings/users",
      label: "Pengaturan",
      icon: SettingsIcon,
      permission: "user.read",
    },
  ];

  return links.filter((link) => !link.permission || can(link.permission));
}

/** Segmen aksi yang punya nama sendiri; sisanya dianggap id. */
const ACTION_LABELS: Record<string, string> = {
  new: "Baru",
  edit: "Edit",
  users: "User",
};

/** Segmen tingkat pertama yang punya halaman tapi bukan item sidebar. */
const SECTION_LABELS: Record<string, string> = {
  profile: "Profil Saya",
};

/**
 * Segmen yang hanya menamai ruang route anaknya dan TIDAK punya `page.tsx`
 * sendiri, ditulis sebagai path penuh supaya nama umum seperti "unit" tidak
 * ikut tersaring di seksi lain yang kebetulan memakainya sebagai halaman asli.
 *
 * Breadcrumb menurunkan href dari struktur URL, jadi tanpa daftar ini setiap
 * segmen perantara diasumsikan bisa dikunjungi — dan yang seperti
 * `/dashboard/equipment/unit` berubah jadi remah "Detail" yang mendarat di 404.
 */
export const PATHLESS_PATHS = new Set(["/dashboard/equipment/unit"]);

export type Crumb = { key: string; label: string; href?: string };

/**
 * Membangun breadcrumb dari segmen route aktif.
 *
 * Segmen dinamis ([id]) sengaja TIDAK ditampilkan apa adanya: nilainya UUID,
 * dan "Proyek › 5f2c1a3e-…" tidak memberi tahu pengguna apa pun. Judul entitas
 * yang sebenarnya hanya diketahui server, sementara pemanggilnya harus berupa
 * Client Component untuk membaca segmen — jadi id dipetakan ke "Detail", dan
 * judul asli tetap tampil sebagai <h1> di halamannya sendiri.
 */
export function buildCrumbs(segments: string[], can: CanFn): Crumb[] {
  const crumbs: Crumb[] = [{ key: "/dashboard", label: "Dashboard", href: "/dashboard" }];
  if (segments.length === 0) return crumbs;

  const [section, ...rest] = segments;
  const sectionPath = `/dashboard/${section}`;
  const link = buildLinks(can).find((l) => l.segment === section);
  crumbs.push({
    key: sectionPath,
    // `profile` sengaja bukan item nav (ia dijangkau lewat menu pengguna), jadi
    // `buildLinks` tidak punya labelnya dan fallback `?? section` akan menulis
    // "profile" — huruf kecil, Inggris, di remah yang seluruhnya Indonesia.
    label: link?.label ?? SECTION_LABELS[section] ?? section,
    href: rest.length > 0 ? (link?.href ?? sectionPath) : undefined,
  });

  for (const [index, segment] of rest.entries()) {
    const isLast = index === rest.length - 1;
    // Kunci diambil dari path kumulatif, bukan indeks: dua remah bisa sama-sama
    // berlabel "Detail", tapi path-nya tidak pernah sama.
    const path = `${sectionPath}/${rest.slice(0, index + 1).join("/")}`;
    if (PATHLESS_PATHS.has(path)) continue;
    crumbs.push({
      key: path,
      label: ACTION_LABELS[segment] ?? "Detail",
      // Hanya remah terakhir yang tanpa tautan (ia halaman saat ini).
      href: isLast ? undefined : path,
    });
  }

  return crumbs;
}
