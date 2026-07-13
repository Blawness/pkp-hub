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
