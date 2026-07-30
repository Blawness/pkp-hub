import type { NextConfig } from "next";

// Fail the build early if env vars are missing/invalid.
import "./env";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // `'unsafe-eval'` di dev untuk source map; ditiadakan di produksi
      // untuk menutup CSP bypass via eval(). Kalau dependensi pihak ketiga
      // membutuhkannya, ganti dengan nonce/strict-dynamic.
      ...(process.env.NODE_ENV === "production"
        ? ["script-src 'self' 'unsafe-inline'"]
        : ["script-src 'self' 'unsafe-inline' 'unsafe-eval'"]),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Mengaktifkan <ViewTransition> React, dipakai untuk mempertahankan panel
  // brand saat navigasi / <-> /login. Masih eksperimental di Next 16;
  // tanpa dukungan browser, navigasi tetap normal — hanya tidak beranimasi.
  experimental: {
    viewTransition: true,
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Header khusus service worker. SW jalan di konteksnya sendiri
      // (bukan mewarisi CSP halaman), jadi boleh kita kunci lebih ketat
      // tanpa mempengaruhi app utama. Cache-Control agresif agar user
      // selalu dapat versi SW terbaru setelah deploy.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
          // Service worker butuh ini agar bisa diperbarui tanpa restart tab.
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // Manifest di-serve dengan Content-Type yang konsisten di semua
      // static host. Next.js biasanya menebak dari ekstensi, tapi untuk
      // `.webmanifest` eksplisit lebih aman.
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;
