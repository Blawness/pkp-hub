import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: false,
    // e2e/ berisi tes Playwright (*.spec.ts), bukan vitest — jangan ikut
    // ke-run oleh `pnpm test`. `.worktrees/**` juga harus dikecualikan:
    // salinan tes di worktree git itu versi cabang yang STALE (alias `@`
    // tetap menunjuk ke pohon utama) dan ikut menjalankan fixture-nya ke DB
    // dev yang sama — persis race wipe-tabel yang dihindari di bawah.
    exclude: ["e2e/**", ".worktrees/**", "**/node_modules/**", "**/dist/**"],
    // Test files share one real (Neon) dev DB and some files wipe whole
    // tables in `beforeAll` (see lib/auth-guards.test.ts) — running files in
    // parallel races those wipes against other files' fixtures.
    fileParallelism: false,
  },
});
