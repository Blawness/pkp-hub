import type { SQL } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth-guards";

/**
 * Jangkauan baris sebuah grant. Urutannya bermakna: `all` mencakup
 * `assigned`, yang mencakup `own`. Dipakai saat menggabungkan izin dari
 * banyak role — lihat `highestScope`.
 */
export const SCOPES = ["all", "assigned", "own"] as const;
export type Scope = (typeof SCOPES)[number];

const SCOPE_RANK: Record<Scope, number> = { own: 0, assigned: 1, all: 2 };

/** Scope terluas di antara dua scope. Union multi-role memakai ini. */
export function highestScope(a: Scope, b: Scope): Scope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

/**
 * Segalanya yang dibutuhkan untuk memutuskan akses dalam satu request.
 *
 * `clientId` ikut di sini — BUKAN di-fetch di dalam fungsi scope — karena
 * fungsi scope harus sinkron: ia menyusun predikat SQL, bukan menjalankan
 * query. Kalau nanti ada nilai lain yang perlu di-fetch untuk menyusun
 * predikat, ia ikut ke sini juga.
 */
export type RbacContext = {
  user: SessionUser;
  /** Kunci berupa string biasa supaya `types.ts` tidak mengimpor registry. */
  permissions: ReadonlyMap<string, Scope>;
  /** `clients.id` yang tertaut ke user portal ini, atau null. */
  clientId: string | null;
};

/** Menyusun predikat SQL untuk satu scope. WAJIB sinkron. */
export type ScopeFn = (ctx: RbacContext) => SQL;
