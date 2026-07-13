"use client";

import { LaptopIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Terang", icon: SunIcon },
  { value: "dark", label: "Gelap", icon: MoonIcon },
  { value: "system", label: "Sistem", icon: LaptopIcon },
] as const;

/**
 * Pemilih tema, dimaksudkan untuk dipasang di dalam <DropdownMenuContent>.
 *
 * `mounted` bukan basa-basi: di server `theme` selalu undefined, jadi menandai
 * pilihan yang sebenarnya pada render pertama akan berbeda dengan hasil
 * hidrasi. Render pertama (server maupun klien) selalu menunjuk "system", lalu
 * setelah efek berjalan barulah nilai asli dipakai — markup awal cocok, dan
 * pengguna tidak melihat apa pun dari pergantian itu karena menu belum terbuka.
 *
 * Nilainya tidak pernah undefined: melepasnya sebentar akan membuat radio group
 * berpindah dari uncontrolled ke controlled, yang diprotes Base UI.
 */
export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    // <DropdownMenuLabel> adalah Menu.GroupLabel milik Base UI: ia HARUS berada
    // di dalam Menu.Group / Menu.RadioGroup, kalau tidak Base UI melempar
    // "MenuGroupContext is missing" dan menumbangkan seluruh halaman.
    <DropdownMenuRadioGroup
      value={mounted && theme ? theme : "system"}
      onValueChange={(value) => setTheme(value as string)}
    >
      <DropdownMenuLabel>Tema</DropdownMenuLabel>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <DropdownMenuRadioItem key={value} value={value}>
          <Icon className="size-4 text-muted-foreground" />
          {label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
