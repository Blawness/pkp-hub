"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
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
import { globalSearch } from "@/lib/actions/search";
import type { SearchResult } from "@/lib/actions/search-logic";

/**
 * Pintu masuk UI untuk Cmd-K global. Dipasang di layout `/dashboard` lewat
 * `<GlobalSearchProvider>`; pemicu di topbar membaca `setOpen` dari context
 * yang sama agar dialog dan tombol tidak perlu tinggal di subtree yang sama.
 *
 * Alur data singkat:
 *   1. user mengetik → `query` lokal cmdk terisi
 *   2. `useDebouncedValue` menahan 200 md → `debouncedQuery`
 *   3. effect menjalankan `globalSearch({ q: debouncedQuery })` lewat
 *      `useAction` (pembungkus next-safe-action); hasilnya ditulis ke `results`
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
  const { executeAsync, isExecuting } = useAction(globalSearch);

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

  // Fetch saat istilah tundaan berubah. `executeAsync` dari `useAction` aman
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
      if (data && data.success) {
        setResults(data.results);
      } else {
        setResults([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, executeAsync]);

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

  const trimmed = query.trim();
  const showInitialHint = trimmed.length === 0;
  const showTooShortHint = trimmed.length > 0 && trimmed.length < MIN_CHARS;
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
          {showInitialHint ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Ketik untuk mencari klien, proyek, atau dokumen.
            </p>
          ) : showTooShortHint ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Ketik minimal {MIN_CHARS} karakter untuk mulai mencari.
            </p>
          ) : showLoading ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground"
            >
              <Loader2Icon aria-hidden className="size-4 animate-spin" />
              Mencari…
            </div>
          ) : fetchError ? (
            <p className="px-3 py-6 text-center text-sm text-destructive">
              Pencarian gagal: {fetchError}
            </p>
          ) : showEmpty ? (
            <CommandEmpty>Tidak ada hasil untuk &quot;{trimmed}&quot;.</CommandEmpty>
          ) : (
            KIND_ORDER.map((kind) => {
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
            })
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
