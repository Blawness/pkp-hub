import { z } from "zod";

/**
 * Password diketik admin, bukan dibuat pemiliknya sendiri, jadi ambang minimal
 * ini penting: admin cenderung memilih sesuatu yang gampang didiktekan.
 * Better Auth sendiri hanya menuntut 8 karakter.
 */
export const passwordSchema = z
  .string()
  .min(10, "Password minimal 10 karakter.")
  .max(128, "Password terlalu panjang.");

export const staffRoleSchema = z.enum(["admin", "surveyor"]);

export const createStaffUserSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(120),
  email: z.email("Format email tidak valid."),
  role: staffRoleSchema,
  password: passwordSchema,
});

export const setUserRoleSchema = z.object({
  userId: z.uuid(),
  role: staffRoleSchema,
});

export const setUserNameSchema = z.object({
  userId: z.uuid(),
  name: z.string().trim().min(1, "Nama wajib diisi.").max(120),
});

export const setUserPasswordSchema = z.object({
  userId: z.uuid(),
  password: passwordSchema,
});

export const userIdSchema = z.object({
  userId: z.uuid(),
});
