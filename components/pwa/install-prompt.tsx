"use client";

import { Download, Plus, Share } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Tombol mengambang + modal "Install Aplikasi" untuk PWA.
 *
 * Tiga kondisi render:
 *  1. Aplikasi sudah terpasang (standalone) → render `null`.
 *  2. Browser mendukung `beforeinstallprompt` (Android Chrome/Edge/Samsung)
 *     → tampilkan tombol, modal memanggil `prompt()` saat konfirmasi.
 *  3. iOS Safari (atau iPadOS Safari yang menyamar sebagai Mac) → tampilkan
 *     tombol, modal berisi instruksi Share → Add to Home Screen.
 *
 * Catatan: iOS TIDAK menaikkan event `beforeinstallprompt`; satu-satunya
 * cara install di sana adalah lewat UI Share sheet. Itulah kenapa kita
 * harus deteksi iOS secara manual.
 *
 * Penolakan disimpan ke localStorage. Kami pakai TTL 30 hari — user yang
 * menolak umumnya masih tidak ingin melihat banner untuk sementara,
 * tapi tidak selamanya (mis. setelah ganti device).
 */
const DISMISS_KEY = "pkp-hub.install-prompt.dismissed-at";
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPhone/iPad klasik
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ mengaku "Macintosh" + punya touch — bedanya dari Mac asli
  // yang tidak pernah punya multi-touch.
  if (
    ua.includes("Mac") &&
    navigator.maxTouchPoints > 1 &&
    // Pengecualian untuk Intel Mac dengan layar sentuh (jarang & tidak
    // punya alur install PWA yang sama dengan iOS).
    !("MSStream" in window)
  ) {
    return true;
  }
  return false;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Android Chrome PWA: `display-mode: standalone`.
  const mqlStandalone = window.matchMedia?.("(display-mode: standalone)");
  if (mqlStandalone?.matches) return true;
  // iOS Safari "Add to Home Screen": flag proprietary (masih di-support
  // Safari modern walaupun tidak di MDN specced API).
  // `navigator.standalone` tidak ada di type definitions tapi dibaca oleh
  // Safari andal; cast `any` sekali di sini adalah batasannya.
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return false;
}

function readDismissedAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const ts = Number.parseInt(raw, 10);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function writeDismissedAt(): number {
  const ts = Date.now();
  try {
    window.localStorage.setItem(DISMISS_KEY, String(ts));
  } catch {
    // localStorage bisa disabled (private mode). Abaikan.
  }
  return ts;
}

function writeDismissedAtFarFuture(): number {
  // TTL 10 tahun — "jangan tampilkan lagi" adalah komitimen jangka panjang.
  const ts = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(ts));
  } catch {
    // abaikan
  }
  return ts;
}

function clearDismissedAt(): void {
  try {
    window.localStorage.removeItem(DISMISS_KEY);
  } catch {
    // Sama: abaikan.
  }
}

export function InstallPrompt() {
  // `mounted` mencegah hydration mismatch — saat SSR kita tidak tahu
  // state installable, jadi render `null`. Tombol muncul setelah effect.
  const [mounted, setMounted] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true); // default true → render null
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  // `dismissedAt` adalah timestamp localStorage (atau null). Disimpan di
  // state agar perubahan pasca-dismiss langsung re-render tanpa harus
  // re-read localStorage lewat useMemo + dependency palsu.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  // Inisialisasi state di client. `isStandalone` default `true` agar tidak
  // menampilkan tombol kilat sebelum kita yakin bukan app terpasang.
  useEffect(() => {
    setMounted(true);
    setIsStandalone(detectStandalone());
    setIsIOS(detectIOS());
    setDismissedAt(readDismissedAt());
  }, []);

  // Daftarkan listener `beforeinstallprompt` (Android/Chrome/Edge) dan
  // `appinstalled` (semua platform). Bersihkan saat unmount.
  useEffect(() => {
    if (!mounted) return;
    const onBeforeInstall = (e: Event) => {
      // Browser akan menampilkan prompt default BILA kita tidak
      // memanggil `preventDefault()`. Cegah agar UI kita yang
      // memegang kendali — tombol di klik dulu, baru `prompt()`.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      clearDismissedAt();
      setDismissedAt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [mounted]);

  // Dipanggil saat user mengeklik tombol "Pasang" di modal Android.
  const handleNativeInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    // Apapun hasilnya, event hanya bisa dipakai sekali.
    setDeferredPrompt(null);
    setDialogOpen(false);
    if (outcome === "dismissed") {
      setDismissedAt(writeDismissedAt());
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDialogOpen(false);
    setDismissedAt(writeDismissedAt());
  }, []);

  const handleDontShowAgain = useCallback(() => {
    setDialogOpen(false);
    setDismissedAt(writeDismissedAtFarFuture());
  }, []);

  // Tentukan apakah tombol boleh tampil. Murah, dihitung tiap render;
  // `mounted` men-guard agar pembacaan `dismissedAt` aman dari SSR.
  const isDismissed =
    !mounted || (dismissedAt !== null && Date.now() - dismissedAt < DISMISS_TTL_MS);
  const canShowButton = !isDismissed && !isStandalone && !installed && (isIOS || !!deferredPrompt);

  if (!mounted) return null;
  if (isStandalone || installed) return null;
  if (!canShowButton && !dialogOpen) return null;

  return (
    <>
      {/* Tombol mengambang kanan-bawah. `z-40` agar di bawah dialog
          (z-50) tapi di atas konten biasa. */}
      {canShowButton && (
        <Button
          variant="default"
          size="lg"
          className="fixed right-4 bottom-4 z-40 rounded-full shadow-lg print:hidden"
          onClick={() => setDialogOpen(true)}
        >
          <Download aria-hidden="true" />
          Install Aplikasi
        </Button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pasang PKP Hub di perangkat Anda</DialogTitle>
            <DialogDescription>
              Akses dashboard lebih cepat langsung dari home screen — tanpa membuka browser.
            </DialogDescription>
          </DialogHeader>

          <div className="text-sm text-foreground">
            {deferredPrompt ? (
              // Android Chrome / Edge / Samsung Internet
              <div className="space-y-3">
                <p>
                  Ketuk tombol di bawah, lalu konfirmasi &ldquo;Install&rdquo; pada dialog yang
                  muncul.
                </p>
                <p className="text-muted-foreground text-xs">
                  Ikon aplikasi akan muncul di home screen dan app drawer perangkat Anda.
                </p>
              </div>
            ) : isIOS ? (
              // iOS / iPadOS Safari — tidak ada API prompt, hanya
              // bisa via Share sheet manual.
              <ol className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                    1
                  </span>
                  <span>
                    Buka menu{" "}
                    <Share
                      aria-hidden="true"
                      className="inline-block size-4 align-text-bottom text-primary"
                    />{" "}
                    <strong>Share</strong> di bar bawah Safari.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                    2
                  </span>
                  <span>
                    Pilih{" "}
                    <Plus
                      aria-hidden="true"
                      className="inline-block size-4 align-text-bottom text-primary"
                    />{" "}
                    <strong>Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                    3
                  </span>
                  <span>
                    Konfirmasi dengan mengetuk <strong>Add</strong> di pojok kanan atas.
                  </span>
                </li>
              </ol>
            ) : (
              <p className="text-muted-foreground text-sm">
                Browser Anda saat ini tidak mendukung install sebagai aplikasi. Coba buka halaman
                ini di Chrome, Edge, atau Safari untuk mendapatkan pengalaman terbaik.
              </p>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={handleDontShowAgain}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Jangan tampilkan lagi
            </button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={handleDismiss}>
                Mungkin nanti
              </Button>
              {deferredPrompt && (
                <Button onClick={handleNativeInstall}>
                  <Download aria-hidden="true" />
                  Pasang sekarang
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
