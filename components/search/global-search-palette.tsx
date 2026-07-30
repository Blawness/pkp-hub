"use client";

import {
  Building2Icon,
  FileTextIcon,
  FolderKanbanIcon,
  HistoryIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { usePermissions } from "@/components/rbac/permissions-provider";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { LoadingContainer } from "@/components/ui/loading-container";
import { globalSearch } from "@/lib/actions/search";
import type { SearchResult } from "@/lib/actions/search-logic";
import { useToastAction } from "@/lib/hooks/use-toast-action";
import type { Permission } from "@/lib/rbac/resources";

/**
 * Pintu masuk UI untuk Cmd-K global. Dipasang di layout `/dashboard` lewat
 * `<GlobalSearchProvider>`; pemicu di topbar membaca `setOpen` dari context
 * yang sama agar dialog dan tombol tidak perlu tinggal di subtree yang sama.
 *
 * Alur data singkat:
 *   1. user mengetik → `query` lokal cmdk terisi
 *   2. `useDebouncedValue` menahan 200 md → `debouncedQuery`
 *   3. effect menjalankan `globalSearch({ q: debouncedQuery })` lewat
 *      `useToastAction` (pembungkus next-safe-action); hasilnya ditulis ke `results`
 *   4. render mengelompokkan hasil per `kind` ke tiga `CommandGroup`
 *   5. tekan Enter → `onSelect` → `router.push(href)` lalu tutup dialog
 *
 * Pintasan `Cmd/Ctrl+K` dipasang global pada `document` (bukan pada input
 * cmdk saja) agar pemicu dari mana pun di area dashboard membuka palette —
 * konsisten dengan spek produk.
 */
type GlobalSearchContextValue = {
  open: boolean;
  setOpen: (next: boolean) => void;
};

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function useGlobalSearch(): GlobalSearchContextValue {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error("useGlobalSearch harus dipanggil di dalam <GlobalSearchProvider>");
  }
  return ctx;
}

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const { can } = usePermissions();
  const allowed = can("search.use");
  const [open, setOpen] = useState(false);
  return (
    <GlobalSearchContext.Provider value={{ open, setOpen }}>
      {children}
      {allowed ? <GlobalSearchPalette /> : null}
    </GlobalSearchContext.Provider>
  );
}

const HEADINGS: Record<SearchResult["kind"], string> = {
  client: "Klien",
  project: "Proyek",
  document: "Dokumen",
};

const KIND_ORDER: SearchResult["kind"][] = ["client", "project", "document"];
const MIN_CHARS = 2;

type QuickAction = {
  id: string;
  label: string;
  keywords: string[];
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "projects",
    label: "Proyek",
    keywords: ["proyek", "project", "buat"],
    href: "/dashboard/projects",
    icon: FolderKanbanIcon,
  },
  {
    id: "clients",
    label: "Klien",
    keywords: ["klien", "client", "pelanggan"],
    href: "/dashboard/clients",
    icon: Building2Icon,
  },
  {
    id: "documents",
    label: "Dokumen",
    keywords: ["dokumen", "document", "unggah"],
    href: "/dashboard/documents",
    icon: FileTextIcon,
  },
  {
    id: "equipment",
    label: "Alat",
    keywords: ["alat", "equipment", "inventaris"],
    href: "/dashboard/equipment",
    icon: WrenchIcon,
  },
  {
    id: "settings",
    label: "Pengaturan",
    keywords: ["pengaturan", "settings", "setelan", "konfigurasi"],
    href: "/dashboard/settings",
    icon: SettingsIcon,
  },
  {
    id: "sessions",
    label: "Sesi Aktif",
    keywords: ["sesi", "session", "login", "online"],
    href: "/dashboard/settings/sessions",
    icon: ShieldCheckIcon,
    permission: "session.read",
  },
  {
    id: "audit",
    label: "Log Audit",
    keywords: ["audit", "log", "riwayat", "aktivitas"],
    href: "/dashboard/settings/audit",
    icon: HistoryIcon,
    permission: "audit.read",
  },
  {
    id: "profile",
    label: "Profil",
    keywords: ["profil", "profile", "akun", "account"],
    href: "/dashboard/profile",
    icon: UserIcon,
  },
];

function GlobalSearchPalette() {
  const { open, setOpen } = useGlobalSearch();
  const router = useRouter();
  // `query` adalah sumber kebenaran tunggal untuk render (selain status
  // eksekusi). Kita tunda 200 md sebelum dipakai sebagai kunci fetch — lihat
  // `useDebouncedValue` di bawah — supaya mengetik cepat tidak menumpuk
  // panggilan server.
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { executeAsync, isExecuting } = useToastAction(globalSearch);

  // Pintasan global ⌘K / Ctrl+K. Dipasang sekali per mount; `setOpen` stabil
  // dari context (state setter), jadi dependensi `[open]` tidak wajib tapi
  // tetap kami sertakan agar toggle membaca nilai terkini dengan benar.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  // Reset state lokal saat dialog ditutup — agar pembukaan berikutnya tidak
  // me-restore istilah pencarian lama atau hasil basi.
  useEffect(() => {
    if (open) return;
    setQuery("");
    setResults([]);
    setFetchError(null);
  }, [open]);

  // Fetch saat istilah tundaan berubah. `executeAsync` dari `useToastAction` aman
  // disimpan di deps karena hook tersebut sudah men-stabilkan referensinya
  // lewat useCallback internal; perubahan referensinya bukan pemicu render.
  useEffect(() => {
    const term = debouncedQuery.trim();
    setFetchError(null);
    if (term.length < MIN_CHARS) {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await executeAsync({ q: term });
      if (cancelled) return;
      if (res?.serverError) {
        setFetchError(res.serverError);
        setResults([]);
        return;
      }
      if (res?.validationErrors) {
        setFetchError("Periksa kembali kata kunci pencarian.");
        setResults([]);
        return;
      }
      const data = res?.data;
      if (data?.success) {
        setResults(data.results);
      } else {
        setResults([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, executeAsync]);

  const { can } = usePermissions();

  const trimmed = query.trim();

  const allowedActions = useMemo(
    () => QUICK_ACTIONS.filter((a) => !a.permission || can(a.permission)),
    [can],
  );

  const filteredActions = useMemo(() => {
    if (trimmed.length === 0) return allowedActions;
    const t = trimmed.toLowerCase();
    return allowedActions.filter(
      (a) => a.keywords.some((k) => k.includes(t)) || a.label.toLowerCase().includes(t),
    );
  }, [allowedActions, trimmed]);

  const grouped = useMemo(() => {
    const buckets: Record<SearchResult["kind"], SearchResult[]> = {
      client: [],
      project: [],
      document: [],
    };
    for (const r of results) buckets[r.kind].push(r);
    return buckets;
  }, [results]);

  function handleSelect(href: string) {
    setOpen(false);
    router.push(href);
  }

  const showInitialHint = trimmed.length === 0;
  const showTooShortHint = trimmed.length > 0 && trimmed.length < MIN_CHARS;
  // Loading = fetch in-flight DAN belum ada hasil basi untuk ditampilkan
  // (hasil sebelumnya tetap ditampilkan saat kueri berikut berjalan, jadi
  // palette tidak berkedip tiap ketukan baru).
  const showLoading = isExecuting && results.length === 0 && trimmed.length >= MIN_CHARS;
  const showEmpty =
    !isExecuting && results.length === 0 && trimmed.length >= MIN_CHARS && !fetchError;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Pencarian global"
      description="Cari klien, proyek, atau dokumen."
    >
      {/* `Command` adalah root cmdk — pembungkus yang menyediakan konteks
          state (search/value/filtered) untuk anak-anaknya. `shouldFilter={false}`
          menonaktifkan filter internal cmdk karena kami sudah memfilter di
          server lewat `globalSearch`; yang masuk ke palette sudah final. */}
      <Command shouldFilter={false} label="Pencarian global PKP Hub">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Cari klien, proyek, atau dokumen…"
        />
        <CommandList>
          {filteredActions.length > 0 ? (
            <CommandGroup heading="Navigasi">
              {filteredActions.map((a) => (
                <CommandItem key={a.id} value={a.label} onSelect={() => handleSelect(a.href)}>
                  <a.icon className="mr-2 size-4" />
                  <span>{a.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {showInitialHint ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Ketik untuk mencari klien, proyek, atau dokumen.
            </p>
          ) : showTooShortHint ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Ketik minimal {MIN_CHARS} karakter untuk mulai mencari.
            </p>
          ) : fetchError ? (
            <p className="px-3 py-6 text-center text-sm text-destructive">
              Pencarian gagal: {fetchError}
            </p>
          ) : showEmpty ? (
            <CommandEmpty>Tidak ada hasil untuk &quot;{trimmed}&quot;.</CommandEmpty>
          ) : (
            <LoadingContainer isLoading={showLoading} type="list" rows={3} className="px-3 py-2">
              {KIND_ORDER.map((kind) => {
                const items = grouped[kind];
                if (items.length === 0) return null;
                return (
                  <CommandGroup key={kind} heading={HEADINGS[kind]}>
                    {items.map((r) => (
                      <CommandItem
                        key={`${kind}-${r.id}`}
                        // `value` dipakai cmdk untuk identitas item saat
                        // di-navigate keyboard; filter tidak dipakai karena
                        // `shouldFilter={false}`, tapi assistive tech tetap
                        // mengumumkan `value` jika tidak ada teks dalam item.
                        value={`${r.label} ${r.sub}`.trim()}
                        onSelect={() => handleSelect(r.href)}
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{r.label}</span>
                          {r.sub ? (
                            <span className="truncate text-xs text-muted-foreground">{r.sub}</span>
                          ) : null}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </LoadingContainer>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
