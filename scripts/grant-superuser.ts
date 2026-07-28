import { eq } from "drizzle-orm";
import { db } from "../lib/db/index";
import { roles, userRoles, users } from "../lib/db/schema";

/**
 * Bootstrap superuser pertama. Chicken-and-egg: assign role lewat UI butuh
 * `role.assign`, yang cuma dipunyai superuser — jadi superuser pertama tidak
 * bisa dibuat lewat UI. Dijalankan manual sekali per environment.
 *
 * Usage: pnpm db:grant-superuser you@example.com
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: pnpm db:grant-superuser <email>");
    process.exit(1);
  }

  const [user] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, email));
  if (!user) {
    console.error(`Tidak ada user dengan email "${email}".`);
    process.exit(1);
  }

  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "superuser"));
  if (!role) {
    console.error('Role "superuser" belum ada di DB ini — jalankan `pnpm db:seed` dulu.');
    process.exit(1);
  }

  await db.insert(userRoles).values({ userId: user.id, roleId: role.id }).onConflictDoNothing();
  console.log(`✓ ${user.name} <${email}> sekarang superuser.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
