"use server";

import { rbacActionClient } from "@/lib/actions/safe-action";
import { globalSearchForUser, type SearchResult } from "@/lib/actions/search-logic";
import { globalSearchInputSchema } from "@/lib/actions/search-schemas";

/**
 * Server action Cmd-K global (spec 2026-07-26). Pintu masuk tunggal palette:
 * pemicu topbar mengirim `{ q }`, action memanggil logika yang sudah
 * di-scope-kan per role (`globalSearchForUser` → `rbacFilter`), lalu
 * mengembalikan baris tipis siap render. Skema input memvalidasi panjang;
 * `assertCan("search.use")` di logika menjadi pagar kedua kalau action
 * dipanggil dari kode lain.
 */
export const globalSearch = rbacActionClient
  .metadata({ permission: "search.use" })
  .inputSchema(globalSearchInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const results: SearchResult[] = await globalSearchForUser(ctx.rbac, parsedInput.q);
    return { success: true as const, results };
  });
