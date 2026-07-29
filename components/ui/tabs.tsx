"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

type TabsRootProps = TabsPrimitive.Root.Props & {
  /**
   * Aktifkan pintasan papan ketik untuk berpindah antar tab dari area
   * Tabs (atau konten di dalamnya). Default `true`. Set `false` bila Tabs
   * berada dalam konteks yang pintasannya sudah dipakai untuk hal lain
   * (mis. editor teks yang menangkap Alt+Arrow).
   *
   * Pintasan yang dipasang:
   *   - `Alt+→` / `Alt+↓`  → tab berikutnya
   *   - `Alt+←` / `Alt+↑`  → tab sebelumnya
   *   - `Ctrl+Tab` / `Ctrl+Shift+Tab` → padanan di PWA
   *
   * Alt+Arrow adalah pilihan utama karena andal di peramban biasa
   * (keydown sampai ke halaman sebelum peramban menjalankan
   * back/forward), tidak seperti Ctrl+Tab yang biasanya di-claim peramban
   * untuk pindah tab peramban dan tidak selalu bisa di-override lewat
   * `preventDefault`. Ctrl+Tab tetap dipasang sebagai bonus karena di
   * PWA terpasang (tanpa chrome peramban) ia bekerja penuh.
   *
   * Listener dipasang pada `document` dan hanya merespons bila fokus
   * berada di dalam Tabs ini — jadi bila ada beberapa Tabs di halaman
   * yang sama, hanya Tabs yang sedang difokuskan yang berpindah
   * (mencegah lompatan silang yang membingungkan).
   *
   * Perpindahan dilakukan dengan mensimulasikan klik pada trigger
   * berikutnya/sebelumnya, sehingga tidak mengganggu mode uncontrolled:
   * nilai baru ditentukan oleh Base UI seperti klik biasa.
   */
  enableTabShortcuts?: boolean
}

function Tabs({
  className,
  orientation = "horizontal",
  enableTabShortcuts = true,
  ...props
}: TabsRootProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enableTabShortcuts) return
    const root = rootRef.current
    if (!root) return

    function getDirection(event: KeyboardEvent): "next" | "prev" | null {
      // Pintasan utama: Alt+Arrow. Pintas peramban Alt+→ (forward) dan
      // Alt+← (back) MENGIRIM keydown ke halaman sebelum dieksekusi,
      // sehingga `preventDefault` di sini efektif membatalkan back/forward
      // selama fokus di dalam Tabs.
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          return "next"
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          return "prev"
        }
      }
      // Bonus PWA: Ctrl+Tab / Ctrl+Shift+Tab. Di peramban biasa ini
      // biasanya di-claim untuk pindah tab peramban sebelum halaman
      // sempat handle, tapi di PWA terpasang (layar penuh, tanpa chrome)
      // event sampai ke kita dan `preventDefault` bekerja.
      if (
        event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key === "Tab"
      ) {
        return event.shiftKey ? "prev" : "next"
      }
      return null
    }

    function onKeyDown(event: KeyboardEvent) {
      const direction = getDirection(event)
      if (!direction) return

      // Fokus harus berada di dalam Tabs ini — lihat komentar prop.
      const active = document.activeElement
      if (!active || !root!.contains(active)) return

      const triggers = Array.from(
        root!.querySelectorAll<HTMLButtonElement>(
          '[data-slot="tabs-trigger"]:not([disabled])',
        ),
      )
      if (triggers.length < 2) return

      const currentIndex = triggers.findIndex(
        (t) => t.getAttribute("aria-selected") === "true",
      )
      // Fallback ke -1 bila (karena alasan apa pun) tidak ada yang
      // aria-selected; index -1 + 1 = 0 → trigger pertama.
      const from = currentIndex === -1 ? -1 : currentIndex
      const len = triggers.length
      const nextIndex =
        direction === "next"
          ? (from + 1) % len
          : (from - 1 + len) % len

      // Cegah peramban memindahkan fokus ke tab peramban berikutnya
      // (untuk Ctrl+Tab) atau menjalankan back/forward (untuk Alt+Arrow).
      event.preventDefault()
      const next = triggers[nextIndex]
      if (!next) return
      next.click()
      next.focus()
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [enableTabShortcuts])

  return (
    <TabsPrimitive.Root
      ref={rootRef}
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, value, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      data-value={value}
      value={value}
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
