# Halaman Profil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setiap user yang login (admin, surveyor, klien) bisa mengganti namanya sendiri dan password-nya sendiri, lewat halaman profil di dalam shell role-nya masing-masing.

**Architecture:** Dua route tipis (`/dashboard/profile`, `/portal/profile`) yang sama-sama merender satu `<ProfileForm>`. Ganti nama lewat server action `authActionClient` yang memakai ulang `setUserName()` yang sudah teruji, dengan `userId` diambil dari sesi — tidak pernah dari input. Ganti password lewat `authClient.changePassword()` dari klien, BUKAN server action, karena `revokeOtherSessions` merotasi cookie sesi dan Server Action tidak bisa meneruskan `Set-Cookie` di app ini.

**Tech Stack:** Next.js 16 App Router, Better Auth 1.6, next-safe-action, react-hook-form + zod, Drizzle, Vitest.

## Global Constraints

- Bahasa UI: **Indonesia**. Komentar kode boleh Indonesia (ikuti berkas sekitarnya).
- Setiap server action WAJIB dibangun dari `authActionClient` / `adminActionClient` / `staffActionClient` di `lib/actions/safe-action.ts`. Jangan pernah `createSafeActionClient()` telanjang.
- Panjang password: pakai `passwordSchema` yang sudah ada (`lib/actions/users-schemas.ts`) — min 10, max 128.
- Nama: pakai skema trim, 1–120 karakter.
- Profil TIDAK boleh diletakkan di `app/dashboard/settings/**` — layout di sana `requireAdmin()` dan akan menolak surveyor.
- Test dijalankan dengan `npm test` (memuat `.env.local`, memakai DB dev sungguhan).
- Lint/format: `npm run lint:fix`. Typecheck: `npm run typecheck`.
- Jangan menambah plugin `nextCookies()` ke `lib/auth.ts` sebagai bagian dari rencana ini.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `lib/actions/profile-schemas.ts` (create) | Skema input profil. Sengaja TIDAK punya `userId`. |
| `lib/actions/profile.ts` (create) | `updateOwnNameAction` — satu-satunya server action di fitur ini. |
| `lib/actions/profile.test.ts` (create) | Test batas keamanan + invarian `revokeOtherSessions`. |
| `components/profile/profile-form.tsx` (create) | Dua form: nama (server action) + password (authClient). |
| `app/dashboard/profile/page.tsx` (create) | Halaman profil staf. |
| `app/portal/profile/page.tsx` (create) | Halaman profil klien. |
| `lib/actions/users-logic.ts` (modify) | Tambah `userHasCredential()`. |
| `components/dashboard/user-menu.tsx` (modify) | Item "Profil saya", href sesuai role. |

---

### Task 1: Skema + server action ganti nama

**Files:**
- Create: `lib/actions/profile-schemas.ts`
- Create: `lib/actions/profile.ts`
- Create: `lib/actions/profile.test.ts`

**Interfaces:**
- Consumes: `setUserName(userId: string, name: string): Promise<void>` dari `lib/actions/users-logic.ts` (sudah ada). `authActionClient` dari `lib/actions/safe-action.ts` (sudah ada, ctx = `{ user: SessionUser }`).
- Produces:
  - `updateOwnNameSchema` — `z.object({ name: z.string().trim().min(1).max(120) })`
  - `updateOwnNameAction` — input `{ name: string }`, output `{ success: true }`

- [ ] **Step 1: Tulis test yang gagal**

Buat `lib/actions/profile.test.ts`:

```ts
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
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `npm test -- profile`
Expected: FAIL — `Failed to resolve import "@/lib/actions/profile-schemas"`.

- [ ] **Step 3: Buat skema**

Buat `lib/actions/profile-schemas.ts`:

```ts
import { z } from "zod";

/**
 * Skema profil.
 *
 * Perhatikan apa yang TIDAK ada di sini: `userId`. Itu bukan kelalaian — itu
 * batas keamanannya. `updateOwnNameAction` mengambil id dari `ctx.user.id`
 * (sesi), jadi tidak ada tempat bagi pemanggil untuk menunjuk akun orang lain.
 * Zod juga membuang key tak dikenal, jadi `userId` yang diselundupkan lewat
 * body tidak akan pernah sampai ke logic.
 */
export const updateOwnNameSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(120, "Nama terlalu panjang."),
});
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `npm test -- profile`
Expected: PASS (4 test).

- [ ] **Step 5: Buat server action**

Buat `lib/actions/profile.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { updateOwnNameSchema } from "@/lib/actions/profile-schemas";
import { authActionClient } from "@/lib/actions/safe-action";
import { setUserName } from "@/lib/actions/users-logic";

/**
 * Aksi profil: user mengurus AKUNNYA SENDIRI. Karena itu `authActionClient`
 * (siapa pun yang login), bukan `adminActionClient` — surveyor dan klien memang
 * harus bisa memakainya.
 *
 * Ganti password TIDAK ada di sini, dan itu disengaja: `revokeOtherSessions`
 * membuat Better Auth menghapus semua sesi lalu memasang cookie sesi BARU, dan
 * Server Action di app ini tidak bisa meneruskan `Set-Cookie` itu ke browser
 * (`nextCookies()` tidak terpasang). Hasilnya user akan ke-kick tepat setelah
 * berhasil ganti password. Jadi password ditangani `authClient.changePassword()`
 * dari komponen klien — lihat `components/profile/profile-form.tsx`.
 */
export const updateOwnNameAction = authActionClient
  .inputSchema(updateOwnNameSchema)
  .action(async ({ parsedInput, ctx }) => {
    // `ctx.user.id`, BUKAN input. Inilah yang membuat aksi ini tidak bisa
    // dipakai menyentuh akun orang lain.
    await setUserName(ctx.user.id, parsedInput.name);

    // Nama dirender sidebar (staf) / topbar (klien), keduanya di LAYOUT.
    // Membuang cache halaman profil saja membuat form berubah tapi sidebar
    // tetap menampilkan nama lama.
    revalidatePath(ctx.user.role === "client" ? "/portal" : "/dashboard", "layout");
    return { success: true as const };
  });
```

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck && npm run lint:fix`
Expected: tanpa error.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/profile-schemas.ts lib/actions/profile.ts lib/actions/profile.test.ts
git commit -m "feat(profile): server action ganti nama sendiri (userId dari sesi, bukan input)"
```

---

### Task 2: Invarian ganti password — test dulu

Menguji perilaku Better Auth yang jadi tumpuan fitur ini. Kalau `revokeOtherSessions` berhenti bekerja seperti yang kita kira, kita harus tahu dari test, bukan dari user yang ke-kick.

**Files:**
- Modify: `lib/actions/profile.test.ts`

**Interfaces:**
- Consumes: `auth` dari `lib/auth.ts`; `auth.api.signInEmail({ body, returnHeaders: true })`, `auth.api.changePassword({ headers, body })`, `auth.api.getSession({ headers, query })`.
- Produces: tidak ada (test saja).

- [ ] **Step 1: Tambahkan test**

Tambahkan ke `lib/actions/profile.test.ts` (import `auth` dari `@/lib/auth` di bagian atas):

```ts
/** Set-Cookie (bisa berisi banyak cookie) -> satu header `cookie` seperti kiriman browser. */
function cookieHeaderFrom(setCookie: string): string {
  return setCookie
    .split(/,(?=\s*[\w.-]+=)/)
    .map((part) => part.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function signIn(email: string, pass: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: pass },
    returnHeaders: true,
  });
  return new Headers({ cookie: cookieHeaderFrom(headers.get("set-cookie") ?? "") });
}

describe("ganti password sendiri", () => {
  it("menolak password lama yang salah", async () => {
    const me = await signIn(`me-${meId}@fixture.test`, password);
    await expect(
      auth.api.changePassword({
        headers: me,
        body: { currentPassword: "salah-sekali", newPassword: "password-baru-panjang" },
      }),
    ).rejects.toThrow();
  });

  it("memutus sesi perangkat lain tapi sesi sendiri tetap hidup", async () => {
    // Dua sesi untuk user yang sama — bayangkan laptop dan HP.
    const laptop = await signIn(`me-${meId}@fixture.test`, password);
    const hp = await signIn(`me-${meId}@fixture.test`, password);

    const { headers: changed } = await auth.api.changePassword({
      headers: laptop,
      body: {
        currentPassword: password,
        newPassword: "password-baru-yang-panjang",
        revokeOtherSessions: true,
      },
      returnHeaders: true,
    });

    // Sesi "laptop" diganti yang BARU oleh Better Auth — cookie penggantinya
    // ada di response. Inilah cookie yang, kalau hilang (mis. dipanggil dari
    // Server Action tanpa nextCookies), membuat user ke-kick setelah ganti
    // password. Test ini yang menjaga kita tidak mengulanginya.
    const laptopBaru = new Headers({
      cookie: cookieHeaderFrom(changed.get("set-cookie") ?? ""),
    });
    const laptopSession = await auth.api.getSession({
      headers: laptopBaru,
      query: { disableCookieCache: true },
    });
    expect(laptopSession?.user.id).toBe(meId);

    // Sesi "HP" harus mati.
    const hpSession = await auth.api.getSession({
      headers: hp,
      query: { disableCookieCache: true },
    });
    expect(hpSession).toBeNull();

    // Kembalikan password fixture supaya test lain tidak terpengaruh urutan.
    await auth.api.changePassword({
      headers: laptopBaru,
      body: { currentPassword: "password-baru-yang-panjang", newPassword: password },
    });
  });
});
```

- [ ] **Step 2: Jalankan test**

Run: `npm test -- profile`
Expected: PASS (6 test). Kalau test "memutus sesi perangkat lain" gagal, **berhenti** — asumsi inti rencana ini salah dan sisanya tidak boleh dibangun di atasnya.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/profile.test.ts
git commit -m "test(profile): kunci invarian revokeOtherSessions (sesi lain putus, sesi sendiri hidup)"
```

---

### Task 3: Penjaga `userHasCredential`

**Files:**
- Modify: `lib/actions/users-logic.ts`
- Modify: `lib/actions/profile.test.ts`

**Interfaces:**
- Produces: `userHasCredential(userId: string): Promise<boolean>` — true kalau user punya baris `accounts` dengan `providerId: "credential"`.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `lib/actions/profile.test.ts` (tambahkan `userHasCredential` ke import dari `@/lib/actions/users-logic`):

```ts
describe("userHasCredential", () => {
  it("true untuk user yang punya baris credential", async () => {
    expect(await userHasCredential(meId)).toBe(true);
  });

  it("false untuk user tanpa baris credential", async () => {
    const orphanId = randomUUID();
    await db.insert(users).values({
      id: orphanId,
      name: "Belum Set Password",
      email: `orphan-${orphanId}@fixture.test`,
      role: "client",
    });

    expect(await userHasCredential(orphanId)).toBe(false);

    await db.delete(users).where(eq(users.id, orphanId));
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `npm test -- profile`
Expected: FAIL — `userHasCredential is not a function` / import error.

- [ ] **Step 3: Implementasi**

Tambahkan ke `lib/actions/users-logic.ts` (setelah `setUserName`):

```ts
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
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `npm test -- profile`
Expected: PASS (8 test).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/users-logic.ts lib/actions/profile.test.ts
git commit -m "feat(profile): userHasCredential untuk menjaga form password"
```

---

### Task 4: Komponen `<ProfileForm>`

**Files:**
- Create: `components/profile/profile-form.tsx`

**Interfaces:**
- Consumes: `updateOwnNameAction` (Task 1), `authClient` dari `@/lib/auth-client`, `passwordSchema` dari `@/lib/actions/users-schemas`, `SessionUser` dari `@/lib/auth-guards`.
- Produces: `<ProfileForm user={SessionUser} hasPassword={boolean} />`

- [ ] **Step 1: Tulis komponennya**

Buat `components/profile/profile-form.tsx`:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOwnNameAction } from "@/lib/actions/profile";
import { updateOwnNameSchema } from "@/lib/actions/profile-schemas";
import { passwordSchema } from "@/lib/actions/users-schemas";
import { authClient } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/auth-guards";

type NameValues = z.infer<typeof updateOwnNameSchema>;

const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, "Password saat ini wajib diisi."),
  newPassword: passwordSchema,
});
type PasswordValues = z.infer<typeof passwordFormSchema>;

export function ProfileForm({ user, hasPassword }: { user: SessionUser; hasPassword: boolean }) {
  const router = useRouter();
  const [nameDone, setNameDone] = useState(false);
  const [passwordDone, setPasswordDone] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const nameForm = useForm<NameValues>({
    resolver: zodResolver(updateOwnNameSchema),
    defaultValues: { name: user.name },
  });

  const updateName = useAction(updateOwnNameAction, {
    onSuccess: () => {
      setNameDone(true);
      // Sidebar/topbar merender nama ini dari sesi; server sudah membuang cache
      // layout-nya, refresh yang menariknya ulang.
      router.refresh();
    },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  const onChangePassword = async (values: PasswordValues) => {
    setPasswordError(null);
    setPasswordDone(false);

    // Lewat authClient, BUKAN server action. `revokeOtherSessions` membuat
    // Better Auth menghapus semua sesi lalu memasang cookie sesi BARU — dan
    // hanya response dari /api/auth/* yang cookienya benar-benar sampai ke
    // browser. Dipanggil dari server action, user justru ke-kick tepat setelah
    // password-nya berhasil diganti.
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });

    if (error) {
      setPasswordError(error.message ?? "Password saat ini salah.");
      return;
    }

    passwordForm.reset({ currentPassword: "", newPassword: "" });
    setPasswordDone(true);
  };

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Nama</CardTitle>
          <CardDescription>
            Nama yang tampil di aplikasi. Email ({user.email}) tidak bisa diubah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={nameForm.handleSubmit((values) => {
              setNameDone(false);
              updateName.execute(values);
            })}
            className="flex flex-col gap-3"
            noValidate
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-name">Nama</Label>
              <Input
                id="profile-name"
                aria-invalid={!!nameForm.formState.errors.name}
                {...nameForm.register("name")}
              />
              {nameForm.formState.errors.name ? (
                <p role="alert" className="text-xs text-destructive">
                  {nameForm.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            {updateName.result?.serverError ? (
              <p role="alert" className="text-sm text-destructive">
                {updateName.result.serverError}
              </p>
            ) : null}
            {nameDone ? <p className="text-sm text-muted-foreground">Nama tersimpan.</p> : null}

            <Button type="submit" disabled={updateName.isPending} className="w-fit">
              {updateName.isPending ? "Menyimpan…" : "Simpan nama"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Mengganti password akan mengeluarkan akun Anda dari perangkat lain. Sesi di perangkat
            ini tetap berjalan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasPassword ? (
            <form
              onSubmit={passwordForm.handleSubmit(onChangePassword)}
              className="flex flex-col gap-3"
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="current-password">Password saat ini</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!passwordForm.formState.errors.currentPassword}
                  {...passwordForm.register("currentPassword")}
                />
                {passwordForm.formState.errors.currentPassword ? (
                  <p role="alert" className="text-xs text-destructive">
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password">Password baru</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!passwordForm.formState.errors.newPassword}
                  {...passwordForm.register("newPassword")}
                />
                {passwordForm.formState.errors.newPassword ? (
                  <p role="alert" className="text-xs text-destructive">
                    {passwordForm.formState.errors.newPassword.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Minimal 10 karakter.</p>
                )}
              </div>

              {passwordError ? (
                <p role="alert" className="text-sm text-destructive">
                  {passwordError}
                </p>
              ) : null}
              {passwordDone ? (
                <p className="text-sm text-muted-foreground">Password diganti.</p>
              ) : null}

              <Button
                type="submit"
                disabled={passwordForm.formState.isSubmitting}
                className="w-fit"
              >
                {passwordForm.formState.isSubmitting ? "Menyimpan…" : "Ganti password"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Akun ini belum punya password. Setel password lebih dulu lewat tautan undangan yang
              dikirim ke {user.email}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint:fix`
Expected: tanpa error.

- [ ] **Step 3: Commit**

```bash
git add components/profile/profile-form.tsx
git commit -m "feat(profile): komponen ProfileForm (nama via action, password via authClient)"
```

---

### Task 5: Dua route + tautan di UserMenu

**Files:**
- Create: `app/dashboard/profile/page.tsx`
- Create: `app/portal/profile/page.tsx`
- Modify: `components/dashboard/user-menu.tsx`

**Interfaces:**
- Consumes: `<ProfileForm user hasPassword />` (Task 4), `userHasCredential` (Task 3), `requireUser` dari `@/lib/auth-guards`.

- [ ] **Step 1: Halaman staf**

Buat `app/dashboard/profile/page.tsx`:

```tsx
import { PageHeader } from "@/components/dashboard/page-header";
import { ProfileForm } from "@/components/profile/profile-form";
import { userHasCredential } from "@/lib/actions/users-logic";
import { requireUser } from "@/lib/auth-guards";

export const metadata = { title: "Profil Saya" };

/**
 * Profil staf. Sengaja TIDAK di bawah /dashboard/settings — layout di sana
 * `requireAdmin()`, yang akan menolak surveyor dari halaman profilnya sendiri.
 *
 * Guard-nya sudah dipasang layout /dashboard (`requireStaff`); `requireUser` di
 * sini hanya untuk mengambil user-nya.
 */
export default async function DashboardProfilePage() {
  const user = await requireUser();
  const hasPassword = await userHasCredential(user.id);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader title="Profil Saya" description="Ubah nama dan password akun Anda." />
      <ProfileForm user={user} hasPassword={hasPassword} />
    </main>
  );
}
```

- [ ] **Step 2: Halaman klien**

Buat `app/portal/profile/page.tsx`:

```tsx
import { ProfileForm } from "@/components/profile/profile-form";
import { userHasCredential } from "@/lib/actions/users-logic";
import { requireUser } from "@/lib/auth-guards";

export const metadata = { title: "Profil Saya" };

/** Profil klien. Guard-nya sudah dipasang layout /portal (`requireClient`). */
export default async function PortalProfilePage() {
  const user = await requireUser();
  const hasPassword = await userHasCredential(user.id);

  return (
    <main className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-medium">Profil Saya</h1>
        <p className="text-sm text-muted-foreground">Ubah nama dan password akun Anda.</p>
      </div>
      <ProfileForm user={user} hasPassword={hasPassword} />
    </main>
  );
}
```

- [ ] **Step 3: Tautan di UserMenu**

Di `components/dashboard/user-menu.tsx`:

Tambahkan import:

```tsx
import { LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
```

Lalu sisipkan item ini tepat SETELAH `<DropdownMenuSeparator />` yang pertama (yang berada di bawah blok identitas nama+email), sebelum `<ThemeMenuItems />`:

```tsx
{/* Klien hidup di /portal, staf di /dashboard — dua shell berbeda, jadi dua
    route. Komponen ini dirender di keduanya, jadi href-nya ikut role. */}
<DropdownMenuItem
  render={
    <Link href={user.role === "client" ? "/portal/profile" : "/dashboard/profile"}>
      <UserIcon className="size-4" />
      Profil saya
    </Link>
  }
/>
<DropdownMenuSeparator />
```

- [ ] **Step 4: Typecheck + lint + seluruh test**

Run: `npm run typecheck && npm run lint:fix && npm test`
Expected: typecheck bersih; seluruh test lulus (140 test: 132 sebelumnya + 8 baru).

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/profile/page.tsx app/portal/profile/page.tsx components/dashboard/user-menu.tsx
git commit -m "feat(profile): halaman profil staf + klien, tautan di menu pengguna"
```

---

### Task 6: Verifikasi di browser sungguhan

Test tidak menyentuh browser. Tiga hal di bawah hanya bisa dibuktikan dengan menjalankan aplikasinya, dan dua di antaranya adalah justru yang paling mudah rusak diam-diam.

**Files:** tidak ada perubahan kode (kecuali kalau menemukan bug).

- [ ] **Step 1: Jalankan build**

Run: `npm run build`
Expected: sukses. `/dashboard/profile` dan `/portal/profile` muncul di daftar route.

- [ ] **Step 2: Jalankan dev server**

Run: `npm run dev`
(Kalau port 3000 sudah dipakai, pakai instance yang sudah jalan.)

- [ ] **Step 3: Ganti nama sebagai admin**

1. Login `admin@pkp.test` / `password123`.
2. Klik nama di kaki sidebar → **Profil saya**.
3. Ganti nama jadi "Yudha Pratama Ganti", Simpan.
4. **Nama di sidebar HARUS ikut berubah tanpa reload manual.** Kalau tidak, `revalidatePath(..., "layout")` tidak bekerja.
5. Kembalikan namanya ke "Yudha Pratama".

- [ ] **Step 4: Ganti password — dan pastikan TIDAK ke-kick**

1. Di halaman profil, isi password saat ini `password123`, password baru `password-baru-123`.
2. Ganti password.
3. **Anda HARUS tetap login.** Kalau terlempar ke /login, `Set-Cookie` dari sesi baru tidak sampai ke browser — kegagalan yang persis diperingatkan spec.
4. Muat ulang `/dashboard` untuk memastikan sesinya benar-benar hidup, bukan sekadar belum di-cek.
5. Kembalikan password ke `password123` lewat form yang sama.

- [ ] **Step 5: Cek sebagai surveyor (yang selama ini tidak punya jalan sama sekali)**

1. Keluar, login `bagas@pkp.test` / `password123`.
2. Buka **Profil saya** dari menu pengguna.
3. Halaman harus terbuka — BUKAN redirect. (Kalau redirect, profilnya salah taruh di bawah `/dashboard/settings`.)
4. Ganti nama, pastikan tersimpan.

- [ ] **Step 6: Cek sebagai klien**

1. Keluar, login `andi@klien.test` / `password123`.
2. Dari menu pengguna di topbar portal → **Profil saya** → harus mendarat di `/portal/profile`.
3. Ganti nama, pastikan tersimpan dan nama di topbar ikut berubah.

- [ ] **Step 7: Commit kalau ada perbaikan**

Kalau ada langkah yang gagal, perbaiki, jalankan `npm test` lagi, lalu commit. Kalau semua lolos, tidak ada yang perlu di-commit.
