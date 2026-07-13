import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { updateOwnNameSchema } from "@/lib/actions/profile-schemas";
import { setUserName } from "@/lib/actions/users-logic";
import { db } from "@/lib/db";
import { accounts, sessions, users } from "@/lib/db/schema";

/**
 * Batas keamanan fitur profil ada di SATU tempat: `userId` datang dari sesi
 * (`ctx.user.id`), tidak pernah dari input. Kalau ia bisa datang dari input,
 * siapa pun yang login bisa mengganti nama siapa pun. Test pertama di bawah
 * menjaga persis itu.
 */

const password = "correct-horse-battery-staple";
let meId: string;
let otherId: string;

beforeAll(async () => {
  meId = randomUUID();
  otherId = randomUUID();
  await db.insert(users).values([
    { id: meId, name: "Saya", email: `me-${meId}@fixture.test`, role: "surveyor" },
    { id: otherId, name: "Orang Lain", email: `other-${otherId}@fixture.test`, role: "surveyor" },
  ]);
  for (const id of [meId, otherId]) {
    await db.insert(accounts).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(password),
    });
  }
});

afterAll(async () => {
  for (const id of [meId, otherId]) {
    await db.delete(sessions).where(eq(sessions.userId, id));
    await db.delete(accounts).where(eq(accounts.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  execSync("pnpm db:seed", { stdio: "inherit" });
});

describe("updateOwnNameSchema", () => {
  it("membuang userId yang diselundupkan lewat input", () => {
    const parsed = updateOwnNameSchema.parse({ name: "Nama Baru", userId: otherId });
    expect(parsed).toEqual({ name: "Nama Baru" });
    expect("userId" in parsed).toBe(false);
  });

  it("memangkas spasi dan menolak nama kosong", () => {
    expect(updateOwnNameSchema.parse({ name: "  Budi  " })).toEqual({ name: "Budi" });
    expect(updateOwnNameSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("ganti nama sendiri", () => {
  it("mengubah nama sendiri tanpa menyentuh user lain", async () => {
    await setUserName(meId, "Nama Saya Yang Baru");

    const [me] = await db.select().from(users).where(eq(users.id, meId));
    const [other] = await db.select().from(users).where(eq(users.id, otherId));

    expect(me.name).toBe("Nama Saya Yang Baru");
    expect(other.name).toBe("Orang Lain");
  });

  it("tidak mengubah role maupun email", async () => {
    await setUserName(meId, "Nama Lain Lagi");
    const [me] = await db.select().from(users).where(eq(users.id, meId));
    expect(me.role).toBe("surveyor");
    expect(me.email).toBe(`me-${meId}@fixture.test`);
  });
});
