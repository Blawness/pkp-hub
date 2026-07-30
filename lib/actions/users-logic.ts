import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import type { Role } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { accounts, clients, roles, sessions, userRoles, users } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/can";
import { roleIdForKey } from "@/lib/rbac/system-roles";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Server-only business logic manajemen user, diuji langsung di
 * `users.test.ts`. Izin ditegakkan lewat engine RBAC (`user.create/setRole/
 * update/archive/restore` — admin-only di matrix); kalau cek dicabut, test
 * "penegakan izin di logic" gagal.
 *
 * Dua invarian di file ini yang menjaga sistem dari terkunci selamanya:
 *
 * 1. **Admin terakhir tidak bisa dicabut.** Mengarsipkan atau menurunkan admin
 *    aktif terakhir akan membuat studio ini TIDAK PUNYA seorang pun yang bisa
 *    mengangkat admin baru — dan karena `disableSignUp: true` di `lib/auth.ts`
 *    mematikan pendaftaran mandiri, tidak ada jalan pulih lewat aplikasi sama
 *    sekali. Satu-satunya jalan keluar adalah menyentuh database langsung.
 *
 * 2. **Admin tidak bisa mengubah role atau mengarsipkan dirinya sendiri.**
 *    Bukan karena berbahaya secara keamanan, tapi karena itu jebakan: satu klik
 *    salah dan ia kehilangan akses ke halaman yang baru saja ia buka.
 *
 * Peran `client` sengaja TIDAK bisa dibuat dari sini. Akun portal klien lahir
 * lewat `inviteClientUser`, yang juga menautkannya ke baris `clients` — membuat
 * user client tanpa tautan itu menghasilkan akun yatim yang tak bisa melihat
 * apa pun.
 */

/** Satu baris `user` apa adanya, tanpa role tambahan yang perlu query kedua. */
type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: Role;
  archivedAt: Date | null;
  createdAt: Date;
};

export type ManagedUser = UserRecord & {
  /**
   * Role TAMBAHAN di atas `role` dasarnya (mis. `superuser`), dari
   * `user_role_assignment`. Baris yang cuma mencerminkan role dasar tidak
   * masuk sini — lihat `listExtraRoleAssignments` di `roles-logic.ts`, yang
   * memakai aturan penyaringan yang sama.
   *
   * Tanpa ini halaman User berbohong secara halus: seorang superuser tampil
   * sebagai "Admin" biasa, tanpa petunjuk apa pun bahwa ia punya izin lebih.
   */
  extraRoles: { key: string; name: string }[];
};

/** Role yang boleh dibuat/diberikan lewat manajemen user. */
export type StaffRole = Extract<Role, "admin" | "surveyor">;

/** Semua user, terbaru dulu. Termasuk yang terarsip (UI yang memisahkannya). */
export async function listUsers(): Promise<ManagedUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      archivedAt: users.archivedAt,
      createdAt: users.createdAt,
    })
    .from(users);

  const assignments = await db
    .select({
      userId: userRoles.userId,
      roleKey: roles.key,
      roleName: roles.name,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId));

  const baseRoleOf = new Map(rows.map((u) => [u.id, u.role as string]));
  const extraByUser = new Map<string, { key: string; name: string }[]>();
  for (const a of assignments) {
    if (a.roleKey === baseRoleOf.get(a.userId)) continue;
    const list = extraByUser.get(a.userId) ?? [];
    list.push({ key: a.roleKey, name: a.roleName });
    extraByUser.set(a.userId, list);
  }

  return rows
    .map((u) => ({
      ...u,
      extraRoles: (extraByUser.get(u.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Jumlah admin yang masih aktif, tidak menghitung `excludeUserId`. */
async function countOtherActiveAdmins(excludeUserId: string): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.archivedAt), ne(users.id, excludeUserId)));
  return rows.length;
}

async function getUserOrThrow(userId: string): Promise<UserRecord> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      archivedAt: users.archivedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) throw new Error("User tidak ditemukan.");
  return user;
}

/**
 * Buat akun staf dengan password awal yang ditentukan admin.
 *
 * Password di-hash dengan `hashPassword` milik Better Auth dan disimpan di
 * tabel `account` yang memang miliknya — bukan hash bikinan sendiri, dan tidak
 * pernah disimpan dalam bentuk mentah di mana pun.
 */
export async function createStaffUser(
  ctx: RbacContext,
  input: {
    name: string;
    email: string;
    role: StaffRole;
    password: string;
  },
): Promise<{ id: string }> {
  assertCan(ctx, "user.create");
  const email = input.email.trim().toLowerCase();

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) {
    throw new Error("Email ini sudah dipakai akun lain.");
  }

  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    name: input.name.trim(),
    email,
    role: input.role,
  });

  const roleId = await roleIdForKey(input.role);
  await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();

  await db.insert(accounts).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(input.password),
  });

  await recordAudit({
    actorId: ctx.user.id,
    action: "create",
    entityType: "user",
    entityId: userId,
    detail: { name: input.name, role: input.role },
  });

  return { id: userId };
}

/**
 * Buat akun portal klien manual: sekaligus menciptakan baris `clients` dan
 * user `client` yang tertaut, plus kredential dengan password awal yang
 * di-hash. Ini jalan bagi admin membuat akun klien tanpa mengandalkan email
 * undangan. `clients.userId` selalu diisi agar tidak jadi akun yatim.
 */
export async function createClientUser(
  ctx: RbacContext,
  input: {
    name: string;
    email: string;
    password: string;
    type?: "individual" | "company";
    phone?: string | null;
    address?: string | null;
  },
): Promise<{ id: string; clientId: string }> {
  assertCan(ctx, "user.create");
  const email = input.email.trim().toLowerCase();

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) {
    throw new Error("Email ini sudah dipakai akun lain.");
  }

  const clientId = randomUUID();
  await db.insert(clients).values({
    id: clientId,
    name: input.name.trim(),
    type: input.type ?? "individual",
    email,
    phone: input.phone ?? null,
    address: input.address ?? null,
  });

  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    name: input.name.trim(),
    email,
    role: "client",
  });

  // Tautkan user ke baris klien — ini yang membedakan akun berguna dari akun yatim.
  await db.update(clients).set({ userId }).where(eq(clients.id, clientId));

  const roleId = await roleIdForKey("client");
  await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();

  await db.insert(accounts).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(input.password),
  });

  await recordAudit({
    actorId: ctx.user.id,
    action: "create",
    entityType: "user",
    entityId: userId,
    detail: { name: input.name, role: "client" },
  });

  return { id: userId, clientId };
}

/** Ganti role seorang user. Tidak bisa dipakai untuk membuat/mengubah client. */
export async function setUserRole(
  ctx: RbacContext,
  userId: string,
  role: StaffRole,
): Promise<void> {
  assertCan(ctx, "user.setRole");
  if (ctx.user.id === userId) {
    throw new Error("Anda tidak bisa mengubah role akun Anda sendiri.");
  }

  const target = await getUserOrThrow(userId);
  if (target.role === "client") {
    throw new Error("Akun klien dikelola lewat halaman Klien, bukan di sini.");
  }

  if (target.role === "admin" && role !== "admin") {
    const others = await countOtherActiveAdmins(userId);
    if (others === 0) {
      throw new Error("Ini admin aktif terakhir — angkat admin lain sebelum menurunkannya.");
    }
  }

  // Kolom `users.role` dan tabel `user_role_assignment` harus bergerak
  // bersama: yang pertama dibaca proxy.ts (tanpa DB), yang kedua sumber izin
  // efektif. Kalau hanya satu yang berubah, user berakhir tanpa izin apa pun.
  const oldRoleId = await roleIdForKey(target.role as StaffRole);
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, oldRoleId)));

  const newRoleId = await roleIdForKey(role);
  await db.insert(userRoles).values({ userId, roleId: newRoleId }).onConflictDoNothing();

  await recordAudit({
    actorId: ctx.user.id,
    action: "setRole",
    entityType: "user",
    entityId: userId,
    detail: { from: target.role, to: role },
  });
}

/**
 * Ganti nama tampilan seorang user.
 *
 * Berbeda dari `setUserRole`/`archiveUser`, ini TIDAK melarang admin menyentuh
 * dirinya sendiri: larangan di sana ada karena satu klik salah bisa mengunci
 * admin dari halaman yang baru ia buka. Mengganti nama tidak memindahkan akses
 * siapa pun, jadi mengubah nama sendiri justru jalur yang paling sering dipakai.
 */
export async function setUserName(ctx: RbacContext, userId: string, name: string): Promise<void> {
  assertCan(ctx, "user.update");
  await getUserOrThrow(userId);
  await db
    .update(users)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(users.id, userId));

  await recordAudit({
    actorId: ctx.user.id,
    action: "update",
    entityType: "user",
    entityId: userId,
    detail: { name },
  });
}

/**
 * Ganti nama AKUN SENDIRI (halaman profil). Izin `profile.updateOwn` dimiliki
 * SEMUA role — beda dari `setUserName` (`user.update`, admin-only) yang bisa
 * menyasar user lain. `userId` selalu `ctx.user.id`, tidak pernah dari input:
 * itulah yang membuat fungsi ini tak bisa dipakai menyentuh akun orang lain.
 */
export async function updateOwnName(ctx: RbacContext, name: string): Promise<void> {
  assertCan(ctx, "profile.updateOwn");
  await db
    .update(users)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(users.id, ctx.user.id));
}

/**
 * Apakah user punya baris credential (password) sama sekali?
 *
 * Dipakai halaman profil untuk memutuskan apakah form ganti password layak
 * dirender. Lewat aplikasi, jawabannya SELALU true bagi siapa pun yang bisa
 * membuka halaman itu: login email/password mensyaratkan baris credential, dan
 * `reset-password` Better Auth membuatnya kalau belum ada. Penjaga ini hanya
 * menahan keadaan yang lahir dari luar aplikasi — baris `accounts` yang dihapus
 * langsung di database.
 */
export async function userHasCredential(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  return Boolean(row);
}

/** Setel ulang password seorang user. Sesi lamanya diputus. */
export async function setUserPassword(
  ctx: RbacContext,
  userId: string,
  password: string,
): Promise<void> {
  assertCan(ctx, "user.update");
  await getUserOrThrow(userId);
  const hashed = await hashPassword(password);

  const [credential] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));

  if (credential) {
    await db.update(accounts).set({ password: hashed }).where(eq(accounts.id, credential.id));
  } else {
    // User yang diundang tapi belum pernah menyetel password belum punya baris
    // credential — buatkan, jangan diam-diam gagal.
    await db.insert(accounts).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashed,
    });
  }

  // Ganti password harus mengusir sesi yang masih berjalan; kalau tidak, orang
  // yang password-nya baru saja dicabut tetap login sampai sesinya kedaluwarsa.
  await db.delete(sessions).where(eq(sessions.userId, userId));

  await recordAudit({
    actorId: ctx.user.id,
    action: "update",
    entityType: "user",
    entityId: userId,
    detail: { field: "password" },
  });
}

/** Arsipkan user: aksesnya dicabut, riwayatnya utuh. */
export async function archiveUser(ctx: RbacContext, userId: string): Promise<void> {
  assertCan(ctx, "user.archive");
  if (ctx.user.id === userId) {
    throw new Error("Anda tidak bisa mengarsipkan akun Anda sendiri.");
  }

  const target = await getUserOrThrow(userId);
  if (target.archivedAt) return;

  if (target.role === "admin") {
    const others = await countOtherActiveAdmins(userId);
    if (others === 0) {
      throw new Error("Ini admin aktif terakhir — angkat admin lain sebelum mengarsipkannya.");
    }
  }

  // Arsip dan putus sesi dalam SATU transaksi untuk meniadakan jendela balap
  // (BUGS-001): tanpa ini, ada celah antara update dan delete sesi tempat
  // request yang sudah lewat proxy bisa tetap menggunakan sesi yang sah.
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Putuskan sesi yang sedang berjalan. `getSession` juga menolak user terarsip,
    // jadi ini lapis kedua — tapi lapis pertama yang membuat pencabutan terasa
    // seketika, bukan menunggu cookie sesi kedaluwarsa.
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });

  await recordAudit({
    actorId: ctx.user.id,
    action: "archive",
    entityType: "user",
    entityId: userId,
    detail: { name: target.name },
  });
}

/** Pulihkan user yang terarsip. Ia harus set/diberi password lagi untuk masuk. */
export async function restoreUser(ctx: RbacContext, userId: string): Promise<void> {
  assertCan(ctx, "user.restore");
  await getUserOrThrow(userId);
  await db
    .update(users)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await recordAudit({
    actorId: ctx.user.id,
    action: "restore",
    entityType: "user",
    entityId: userId,
  });
}
