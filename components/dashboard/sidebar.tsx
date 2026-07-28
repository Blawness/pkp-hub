"use client";

import { PanelLeftIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { GridTexture } from "@/components/brand/grid-texture";
import { buildLinks, SIDEBAR_PIN_COOKIE } from "@/components/dashboard/nav-config";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { usePermissions } from "@/components/rbac/permissions-provider";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth-guards";
import { cn } from "@/lib/utils";

/**
 * Sidebar staf (desktop). Laci mobile hidup di `mobile-nav.tsx`.
 *
 * Preferensi pin disimpan di cookie, bukan localStorage, supaya layout di
 * server sudah tahu lebarnya pada render pertama. Dengan localStorage sidebar
 * akan selalu tergambar lebar dulu lalu menciut setelah hidrasi — kedip yang
 * terlihat setiap kali memuat halaman.
 *
 * BENTUK: `<aside>` bukan yang terlihat — ia cuma PENAHAN RUANG, dan lebarnya
 * hanya bergantung pada `pinned`. Yang terlihat adalah panel `absolute` di
 * dalamnya. Pemisahan ini yang memungkinkan panel melebar MENIMPA konten alih-
 * alih mendorongnya: `<aside>` adalah flex item, jadi mengubah lebarnya selalu
 * menggeser kolom di sebelahnya.
 */

/**
 * Jeda buka menahan panel supaya tidak berkedip saat kursor cuma melintas
 * menuju konten. Jeda tutup lebih panjang agar kursor yang keluar sedikit
 * lalu balik tidak memicu tutup-buka.
 */
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 200;

export function DashboardSidebar({
  user,
  defaultPinned,
}: {
  user: SessionUser;
  defaultPinned: boolean;
}) {
  const [pinned, setPinned] = useState(defaultPinned);
  const [hovered, setHovered] = useState(false);
  // Diasumsikan mampu-hover sampai terbukti sebaliknya: efek di bawah jalan
  // sebelum interaksi pertama mungkin terjadi, dan menebak `true` menghindari
  // panel yang sempat salah gambar di desktop.
  const [hoverCapable, setHoverCapable] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { can } = usePermissions();
  const links = buildLinks(can);

  const collapsed = !pinned && !hovered;

  useEffect(() => {
    setHoverCapable(window.matchMedia("(hover: hover)").matches);
  }, []);

  // Timer yang masih hidup saat komponen lepas akan memanggil setState pada
  // komponen yang sudah tidak ada.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /**
   * Jadwalkan buka/tutup karena kursor. Diam saja saat dipin (hover tidak
   * berlaku) dan saat perangkat tidak punya hover — di layar sentuh
   * `pointerenter` tetap menyala saat tap, dan tanpa penjagaan ini panel
   * nyangkut terbuka sampai pengguna menyentuh tempat lain.
   */
  function scheduleHover(next: boolean, delay: number) {
    if (pinned || !hoverCapable) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(next), delay);
  }

  /** Buka/tutup seketika — dipakai jalur fokus, yang selalu disengaja. */
  function revealNow(next: boolean) {
    if (timer.current) clearTimeout(timer.current);
    setHovered(next);
  }

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    // Saat pin dilepas, kursor sedang berada di atas tombol — yang berarti di
    // dalam panel. Tanpa baris ini `hovered` yang basi (false) membuat panel
    // langsung menciut di bawah kursor, dan ia tidak akan terbuka lagi sampai
    // kursor keluar lalu masuk kembali.
    if (!next) revealNow(true);
    // max-age 1 tahun; preferensi tata letak, bukan data sensitif.
    // biome-ignore lint/suspicious/noDocumentCookie: CookieStore API belum ada di Safari, dan tidak sepadan untuk satu penulisan cookie sesederhana ini.
    document.cookie = `${SIDEBAR_PIN_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      data-slot="sidebar"
      className={cn(
        "relative hidden shrink-0 md:block",
        // Sticky setinggi viewport, bukan setinggi dokumen: tanpa ini aside
        // ikut memanjang mengikuti isi halaman, dan blok pengguna di kakinya
        // terdorong jauh ke bawah lipatan — tak terlihat sampai halaman
        // digulir habis.
        "sticky top-0 h-svh",
        // `position: sticky` SELALU membentuk konteks tumpukan baru, walau
        // z-index-nya "auto" — jadi tanpa z eksplisit di sini, seluruh isi
        // `<aside>` (termasuk panel z-30 di dalamnya) tetap kalah tumpuk dari
        // `content-column`, sibling belakangan dengan z sama-sama "auto".
        // Topbar (`topbar.tsx`) juga sticky di z-30 — angka yang SAMA masih
        // kalah karena seri z-index dimenangkan oleh urutan DOM belakangan,
        // jadi di sini harus lebih tinggi, bukan cuma disamakan.
        "z-40",
        "transition-[width] duration-(--motion-base) ease-(--ease-out-expo)",
        pinned ? "w-64" : "w-[4.5rem]",
      )}
    >
      <div
        data-slot="sidebar-panel"
        data-collapsed={collapsed}
        onPointerEnter={() => scheduleHover(true, OPEN_DELAY_MS)}
        onPointerLeave={() => scheduleHover(false, CLOSE_DELAY_MS)}
        // Fase capture: `focus` tidak menggelembung, jadi tanpa `Capture`
        // fokus yang mendarat di tautan anak tidak akan pernah terdeteksi.
        onFocusCapture={() => revealNow(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            revealNow(false);
          }
        }}
        className={cn(
          // z-30: panel harus menimpa kolom konten di sebelahnya saat melebar
          // karena hover, bukan cuma duduk sejajar. (Konteks tumpukan yang
          // sesungguhnya diperbaiki di `<aside>` — lihat komentar di sana.)
          "absolute inset-y-0 left-0 z-30 flex flex-col overflow-hidden",
          "border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "transition-[width] duration-(--motion-base) ease-(--ease-out-expo)",
          collapsed ? "w-[4.5rem]" : "w-64",
          // Hanya saat menimpa. Saat dipin tidak ada yang ditimpa.
          !pinned && !collapsed && "shadow-lg",
        )}
      >
        {/* Tekstur grid yang sama dengan panel brand — memudar ke bawah supaya
            tidak bersaing dengan tautan navigasi. */}
        <GridTexture className="pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />

        {/*
          Tombol pin duduk di header, bukan di kaki sidebar. Pojok kiri-bawah
          adalah wilayah yang direbut hal lain — overlay devtools, pratinjau URL
          yang dimunculkan browser saat menunjuk tautan — jadi tombol di sana
          gampang tertimpa dan tak bisa ditekan.
        */}
        <div className="relative flex h-16 items-center gap-2 px-3">
          {collapsed ? null : (
            <>
              <Image
                src="/logo-pkp.webp"
                alt=""
                aria-hidden
                width={32}
                height={32}
                priority
                className="ml-1 size-7 shrink-0"
              />
              <span className="font-heading flex-1 truncate text-sm font-semibold tracking-tight">
                PKP Hub
              </span>
            </>
          )}

          {/*
            Posisi tombol dianimasikan lewat `right`, BUKAN dibiarkan ikut
            alur flex bersama logo/wordmark yang mucul-hilang seketika (bukan
            bertransisi). Kalau tombol ikut alur flex itu, saat hover membuka
            panel ia MELOMPAT dari tengah ke kanan dalam satu frame — dan
            klik yang mendarat tepat di celah lompatan itu (skenario yang
            sengaja dites: hover lalu langsung klik pin) mengenai latar
            kosong header, bukan tombolnya.
          */}
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 transition-[right] duration-(--motion-base) ease-(--ease-out-expo)",
              collapsed ? "right-[calc(50%-0.875rem)]" : "right-3",
            )}
          >
            {/*
              Sembunyikan tombol di rail sempit — di sana ia berdesakan dengan
              ikon nav dan gampang tertekan tak sengaja.

              KECUALI saat perangkat tidak punya hover: di layar sentuh panel
              tidak pernah melebar, jadi aturan di atas akan menyembunyikan
              tombol ini selamanya — padahal pin justru satu-satunya jalan keluar
              dari rail di sana.
            */}
            {!collapsed || !hoverCapable ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={togglePin}
                aria-label={pinned ? "Lepas pin sidebar" : "Pin sidebar tetap terbuka"}
                // `aria-pressed`, bukan `aria-expanded`: ini tombol dwi-keadaan
                // yang MENGUNCI, bukan pengungkap. Sejak hover jadi pemicu
                // buka-tutup, "expanded" bukan lagi milik tombol ini.
                aria-pressed={pinned}
                className="text-muted-foreground"
              >
                <PanelLeftIcon className={cn("transition-transform", !pinned && "rotate-180")} />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="relative flex-1 overflow-y-auto py-2">
          <SidebarNav links={links} collapsed={collapsed} showTooltips={false} />
        </div>

        <div className="relative border-t border-sidebar-border p-2">
          <UserMenu user={user} collapsed={collapsed} />
        </div>
      </div>
    </aside>
  );
}
