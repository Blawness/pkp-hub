"use server";

import { revalidatePath } from "next/cache";
import { updateOwnNameSchema } from "@/lib/actions/profile-schemas";
import { rbacActionClient } from "@/lib/actions/safe-action";
import { updateOwnName } from "@/lib/actions/users-logic";

/**
 * Aksi profil: user mengurus AKUNNYA SENDIRI. Karena itu permission-nya
 * `profile.updateOwn` — satu-satunya izin yang dipegang SEMUA role (scope
 * `own`); surveyor dan klien memang harus bisa memakainya.
 *
 * Ganti password TIDAK ada di sini, dan itu disengaja: `revokeOtherSessions`
 * membuat Better Auth menghapus semua sesi lalu memasang cookie sesi BARU.
 * Sejak `nextCookies()` terpasang (lib/auth.ts) Server Action sebenarnya sudah
 * bisa meneruskan `Set-Cookie` itu, tapi pertukaran "hapus semua sesi + pasang
 * sesi baru" paling aman dilakukan lewat `authClient.changePassword()` langsung
 * dari komponen klien — satu roundtrip HTTP yang response-nya pasti membawa
 * cookie baru. Lihat `components/profile/profile-form.tsx`.
 */
export const updateOwnNameAction = rbacActionClient
  .metadata({ permission: "profile.updateOwn" })
  .inputSchema(updateOwnNameSchema)
  .action(async ({ parsedInput, ctx }) => {
    // `updateOwnName` memakai `ctx.user.id`, BUKAN input. Inilah yang membuat
    // aksi ini tidak bisa dipakai menyentuh akun orang lain.
    await updateOwnName(ctx.rbac, parsedInput.name);

    // Nama dirender sidebar (staf) / topbar (klien), keduanya di LAYOUT.
    // Membuang cache halaman profil saja membuat form berubah tapi sidebar
    // tetap menampilkan nama lama.
    revalidatePath(ctx.rbac.user.role === "client" ? "/portal" : "/dashboard", "layout");
    return { success: true as const };
  });
