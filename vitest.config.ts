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
    // Test files share one real (Neon) dev DB and some files wipe whole
    // tables in `beforeAll` (see lib/auth-guards.test.ts) — running files in
    // parallel races those wipes against other files' fixtures.
    fileParallelism: false,
  },
});
