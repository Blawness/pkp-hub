import { Resend } from "resend";
import { env } from "@/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Transactional email, extracted so more than one caller can send mail.
 *
 * Sampai sekarang satu-satunya pengirim email adalah `sendResetPassword` di
 * `lib/auth.ts` (undangan portal klien), yang menaruh alamat pengirim dan
 * fallback console-log-nya sendiri di dalam konfigurasi Better Auth. Notifikasi
 * perubahan status butuh perilaku yang sama persis, jadi keduanya sekarang
 * memakai modul ini.
 *
 * `Mailer` sengaja dibikin sebagai tipe fungsi supaya test bisa menyuntikkan
 * pengirim palsu — tanpa itu, satu-satunya cara menguji isi email adalah
 * benar-benar memanggil Resend.
 */

export const EMAIL_FROM = "PKP Hub <onboarding@resend.dev>";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type Mailer = (message: EmailMessage) => Promise<void>;

/**
 * Kirim lewat Resend; kalau `RESEND_API_KEY` kosong (dev / build environment),
 * log ke konsol alih-alih crash atau diam-diam menelan pesannya — pola yang
 * sudah dipakai flow undangan sejak Phase 2.
 *
 * Resend TIDAK melempar saat API-nya menolak; ia mengembalikan `{ error }`.
 * Diamkan itu dan kegagalan kirim akan lolos sebagai "sukses", jadi errornya
 * dinaikkan jadi exception di sini.
 */
export const sendEmail: Mailer = async ({ to, subject, text }) => {
  if (!resend) {
    console.log(`[email] untuk ${to}: ${subject}\n${text}`);
    return;
  }

  const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, text });
  if (error) {
    throw new Error(`Resend gagal mengirim email ke ${to}: ${error.message}`);
  }
};
