import { sql } from "drizzle-orm";
import { db } from "../lib/db/index";
import { backfillUserRoles, seedSystemRoles } from "../lib/rbac/system-roles";

/**
 * Menyelaraskan role SISTEM + grant-nya di DB dengan katalog di kode.
 *
 * Kenapa ini ada: `seedSystemRoles()` sebelumnya HANYA dipanggil dari
 * `lib/db/seed.ts`, yang membuat data demo dan karena itu dilarang jalan di
 * produksi (lihat DEPLOY.md §5). Akibatnya tidak ada satu pun jalan resmi
 * untuk menyegarkan grant di prod — setiap fitur yang menambah permission
 * baru (mis. `search.use`) ter-deploy kodenya tapi grant-nya tidak pernah
 * ditulis, jadi fitur itu diam-diam ditolak `can()` yang fail-closed.
 *
 * Script ini sengaja TIDAK menyentuh data demo apa pun. Idempoten:
 * - `seedSystemRoles` menulis ulang grant role sistem dari matrix di kode
 *   (role KUSTOM buatan superuser tidak disentuh sama sekali),
 * - `backfillUserRoles` hanya menambah assignment yang hilang
 *   (`onConflictDoNothing`), tidak pernah menghapus.
 *
 * Usage:
 *   pnpm db:sync-roles         # dev  (.env.local)
 *   pnpm db:sync-roles:prod    # prod (.env.prod)
 */
async function main() {
  const [{ host, name }] = await db
    .execute<{
      host: string;
      name: string;
    }>(sql`select inet_server_addr()::text as host, current_database() as name`)
    .then((r) => (Array.isArray(r) ? r : r.rows));

  console.log(`DB: ${name} @ ${host ?? "(pooler)"}`);

  const before = await db.execute<{ key: string; grants: number }>(sql`
    select r.key, count(rp.id)::int as grants
    from role r left join role_permission rp on rp.role_id = r.id
    group by r.key order by r.key
  `);

  await seedSystemRoles();
  await backfillUserRoles();

  const after = await db.execute<{ key: string; grants: number }>(sql`
    select r.key, count(rp.id)::int as grants
    from role r left join role_permission rp on rp.role_id = r.id
    group by r.key order by r.key
  `);

  const rowsOf = (r: unknown) =>
    (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as {
      key: string;
      grants: number;
    }[];

  const beforeByKey = new Map(rowsOf(before).map((r) => [r.key, r.grants]));
  console.log("grant per role (sebelum -> sesudah):");
  for (const row of rowsOf(after)) {
    const prev = beforeByKey.get(row.key);
    const mark = prev === undefined ? " (BARU)" : prev !== row.grants ? " *" : "";
    console.log(`  ${row.key}: ${prev ?? 0} -> ${row.grants}${mark}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
