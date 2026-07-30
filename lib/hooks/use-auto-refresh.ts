"use client";

import { useEffect, useRef } from "react";

/**
 * Poll `callback` setiap `intervalMs` selama tab visible.
 *
 * Otomatis pause saat dokumen hidden (tab di-background) sehingga tidak
 * membuang query DB sia-sia, dan berhenti total saat `enabled` false
 * (mis. ada mutation yang sedang jalan). Dipakai untuk "live" monitoring
 * berbasis polling — cost hanya muncul saat ada yang benar-benar melihat.
 */
export function useAutoRefresh(callback: () => void, intervalMs: number, enabled = true): void {
  // Simpan callback terbaru di ref agar effect tidak perlu re-run tiap render.
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) {
        timer = setInterval(() => saved.current(), intervalMs);
      }
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
