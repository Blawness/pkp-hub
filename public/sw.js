/* eslint-disable */
/**
 * Service worker minimal PKP Hub.
 *
 * Alasan ada padahal tidak butuh offline: Chrome/Edge hanya mau memunculkan
 * `beforeinstallprompt` (tombol "Install app" native) bila situs punya SW
 * yang terdaftar. Persyaratan fetch handler sudah DIANGKAT sejak Chrome 91
 * (2021) — handler di sini sengaja TIDAK dipasang karena:
 *
 *  1. Next.js App Router menggunakan RSC payload (text/x-component) dengan
 *     `Transfer-Encoding: chunked` + ReadableStream. Membungkus respons itu
 *     di `event.respondWith(fetch(req))` bisa men-buffer atau memutus stream
 *     sehingga hydration client gagal dan link/button tidak responsif.
 *  2. `clients.claim()` di activate akan mengambil alih klien yang sedang
 *     navigasi — request RSC yang sudah jalan bisa putus di tengah jalan.
 *
 * Browser default (network passthrough) berlaku untuk semua request karena
 * tidak ada fetch handler yang mendaftarkan dirinya.
 *
 * Saat push notification dibutuhkan nanti, tambahkan listener `push` dan
 * `notificationclick` di sini. Pertahankan keputusan TANPA fetch handler
 * kecuali ada kebutuhan offline caching yang riil.
 */
const CACHE_NAME = "pkp-hub-shell-v1";

self.addEventListener("install", () => {
  // Pasang SW baru segera, jangan tunggu tab lama ditutup. Aman tanpa
  // `clients.claim()`: klien existing akan di-tover oleh SW baru pada
  // navigasi berikutnya, bukan dipaksa migrasi di tengah sesi.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Bersihkan cache generasi lama agar tidak bocor ke device.
  // JANGAN panggil `self.clients.claim()` di sini — lihat catatan di
  // header file.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      ),
  );
});
