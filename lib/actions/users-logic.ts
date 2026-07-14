import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import type { Role, SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { accounts, sessions, users } from "@/lib/db/schema";

/**
 * Server-only business logic manajemen user (admin-only), diuji langsung di
 * `users.test.ts`.
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

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  archivedAt: Date | null;
  createdAt: Date;
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

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Jumlah admin yang masih aktif, tidak menghitung `excludeUserId`. */
async function countOtherActiveAdmins(excludeUserId: string): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.archivedAt), ne(users.id, excludeUserId)));
  return rows.length;
}

async function getUserOrThrow(userId: string): Promise<ManagedUser> {
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
export async function createStaffUser(input: {
  name: string;
  email: string;
  role: StaffRole;
  password: string;
}): Promise<{ id: string }> {
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

  await db.insert(accounts).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(input.password),
  });

  return { id: userId };
}

/** Ganti role seorang user. Tidak bisa dipakai untuk membuat/mengubah client. */
export async function setUserRole(
  actor: SessionUser,
  userId: string,
  role: StaffRole,
): Promise<void> {
  if (actor.id === userId) {
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

  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Ganti nama tampilan seorang user.
 *
 * Berbeda dari `setUserRole`/`archiveUser`, ini TIDAK melarang admin menyentuh
 * dirinya sendiri: larangan di sana ada karena satu klik salah bisa mengunci
 * admin dari halaman yang baru ia buka. Mengganti nama tidak memindahkan akses
 * siapa pun, jadi mengubah nama sendiri justru jalur yang paling sering dipakai.
 */
export async function setUserName(userId: string, name: string): Promise<void> {
  await getUserOrThrow(userId);
  await db
    .update(users)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(users.id, userId));
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
export async function setUserPassword(userId: string, password: string): Promise<void> {
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
}

/** Arsipkan user: aksesnya dicabut, riwayatnya utuh. */
export async function archiveUser(actor: SessionUser, userId: string): Promise<void> {
  if (actor.id === userId) {
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

  await db
    .update(users)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Putuskan sesi yang sedang berjalan. `getSession` juga menolak user terarsip,
  // jadi ini lapis kedua — tapi lapis pertama yang membuat pencabutan terasa
  // seketika, bukan menunggu cookie sesi kedaluwarsa.
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Pulihkan user yang terarsip. Ia harus set/diberi password lagi untuk masuk. */
export async function restoreUser(userId: string): Promise<void> {
  await getUserOrThrow(userId);
  await db
    .update(users)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
