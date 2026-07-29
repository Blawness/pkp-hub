/* eslint-disable */
/**
 * Service worker minimal PKP Hub.
 *
 * Alasan ada padahal tidak butuh offline: Chrome/Edge hanya mau memunculkan
 * `beforeinstallprompt` (tombol "Install app" native) bila situs punya SW
 * dengan fetch handler. Kita tidak cache apa pun — handler ini cuma
 * meneruskan request ke network apa adanya.
 *
 * Saat push notification dibutuhkan nanti, tambahkan listener `push` dan
 * `notificationclick` di sini. Server-side, panggil `subscribeUser` dari
 * Server Action (lihat docs/01-app/02-guides/progressive-web-apps.md).
 *
 * Penomoran versi di nama cache: naikkan bila strategi fetch berubah,
 * sehingga `activate` lama membersihkan cache lama.
 */
const CACHE_NAME = "pkp-hub-shell-v1";

self.addEventListener("install", () => {
  // Pasang SW baru segera, jangan tunggu tab lama ditutup.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Bersihkan cache generasi lama agar tidak bocor ke device.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Network-first, no cache. Placeholder untuk masa depan: ganti ke
  // `caches.match` + `fetch` fallback kalau mau offline mode.
  const { request } = event;
  if (request.method !== "GET") return;
  event.respondWith(fetch(request));
});
