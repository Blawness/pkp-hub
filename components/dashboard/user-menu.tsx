"use client";

import { LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeMenuItems } from "@/components/theme/theme-menu-items";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/auth-guards";
import { roleLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** "Yudha Prasetyo" -> "YP"; "Yudha" -> "YU". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Blok pengguna di kaki sidebar: identitas, pemilih tema, dan keluar.
 *
 * Sebelum ini aplikasi sama sekali tidak punya tombol keluar di UI mana pun —
 * `signOut` sudah diekspor dari `lib/auth-client` tapi tidak pernah dipanggil.
 *
 * `router.refresh()` setelah keluar bukan hiasan: mendorong ke /login saja
 * menyisakan hasil render Server Component milik sesi lama di cache router
 * klien, jadi menekan Kembali bisa memperlihatkan sekilas halaman dashboard
 * berisi data orang yang baru saja keluar.
 */
export function UserMenu({
  user,
  collapsed = false,
  // Default "top" karena pemakaian aslinya ada di KAKI sidebar — menu yang
  // membuka ke bawah dari sana akan keluar layar. Portal klien memasangnya di
  // topbar dan harus membalik arahnya.
  side = "top",
}: {
  user: SessionUser;
  collapsed?: boolean;
  side?: "top" | "bottom";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    try {
      await signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Menu pengguna: ${user.name}`}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
              "hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              collapsed && "justify-center",
            )}
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            {collapsed ? null : (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{user.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {roleLabel[user.role] ?? user.role}
                </span>
              </span>
            )}
          </button>
        }
      />

      <DropdownMenuContent side={side} align="start" className="w-56">
        {/* Identitas ini bukan label sebuah grup, jadi ia TIDAK memakai
            <DropdownMenuLabel> — di Base UI itu Menu.GroupLabel dan hanya sah
            di dalam Menu.Group. Sekadar teks, ditulis sebagai teks. */}
        <div className="flex flex-col gap-0.5 px-1.5 py-1">
          <span className="truncate text-sm font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </div>
        <DropdownMenuSeparator />

        {/* Klien hidup di /portal, staf di /dashboard — dua shell berbeda, jadi
            dua route. Komponen ini dirender di keduanya, jadi href-nya ikut
            role. `render` (bukan `asChild`) karena dropdown di sini Base UI. */}
        <DropdownMenuItem
          render={
            <Link href={user.role === "client" ? "/portal/profile" : "/dashboard/profile"}>
              <UserIcon className="size-4" />
              Profil saya
            </Link>
          }
        />
        <DropdownMenuSeparator />

        <ThemeMenuItems />
        <DropdownMenuSeparator />

        <DropdownMenuItem disabled={pending} onClick={handleSignOut} variant="destructive">
          <LogOutIcon className="size-4" />
          {pending ? "Keluar…" : "Keluar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
