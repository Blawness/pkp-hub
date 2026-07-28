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
    // ke-run oleh `pnpm test`. Folder worktree juga harus dikecualikan:
    // salinan tes di worktree git itu versi cabang yang STALE (alias `@`
    // tetap menunjuk ke pohon utama) dan ikut menjalankan fixture-nya ke DB
    // dev yang sama — persis race wipe-tabel yang dihindari di bawah.
    // `.claude/worktrees/**` ikut di sini: worktree yang dibuat lewat tooling
    // agen mendarat di sana, bukan di `.worktrees/`.
    exclude: [
      "e2e/**",
      ".worktrees/**",
      ".claude/worktrees/**",
      "**/node_modules/**",
      "**/dist/**",
    ],
    // Test files share one real (Neon) dev DB and some files wipe whole
    // tables in `beforeAll` (see lib/auth-guards.test.ts) — running files in
    // parallel races those wipes against other files' fixtures.
    fileParallelism: false,
  },
});
