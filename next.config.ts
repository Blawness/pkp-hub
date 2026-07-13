import type { NextConfig } from "next";

// Fail the build early if env vars are missing/invalid.
import "./env";

const nextConfig: NextConfig = {
  // Mengaktifkan <ViewTransition> React, dipakai untuk mempertahankan panel
  // brand saat navigasi / <-> /login. Masih eksperimental di Next 16;
  // tanpa dukungan browser, navigasi tetap normal — hanya tidak beranimasi.
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
