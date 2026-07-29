"use client";

import { useEffect } from "react";

/**
 * Mendaftarkan `/sw.js` ke browser. Dipasang sekali di root layout.
 *
 * Registrasi terjadi setelah `load` supaya SW tidak争夺 initial render —
 * untuk app interaktif ini, install prompt di Android baru bisa muncul
 * setelah user berinteraksi dan SW sudah aktif.
 *
 * HTTPS adalah prasyarat mutlak untuk `navigator.serviceWorker` di luar
 * localhost; di dev, `next dev` tanpa HTTPS tidak akan mendaftarkan SW
 * dan itu oleh design.
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Daftarkan di event 'load' agar tidak menunda first paint.
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((err) => {
          // Gagal register tidak fatal — app tetap jalan, hanya
          // tidak bisa di-install di Android/Chrome.
          // eslint-disable-next-line no-console
          console.warn("[pwa] service worker registration failed:", err);
        });
    };
    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
