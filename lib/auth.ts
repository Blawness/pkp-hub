import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Resend } from "resend";
import { env } from "@/env";
import { db } from "@/lib/db";
import { accounts, sessions, users, verifications } from "@/lib/db/schema";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Better Auth configuration, wired to the EXISTING Drizzle tables defined in
 * `lib/db/schema.ts` (Phase 1). Do not let the CLI generate new tables — the
 * schema map below points Better Auth's model names ("user", "session",
 * "account", "verification") at our already-migrated tables.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // Aturan 10 karakter (`passwordSchema`) hanya ditegakkan zod di sisi klien.
    // Tanpa baris ini, default Better Auth (8) yang berlaku di
    // /api/auth/change-password, jadi POST langsung bisa menyetel password 8
    // karakter dan kebijakannya bocor. Samakan di server.
    minPasswordLength: 10,
    // No public self-signup: accounts are only created by the admin via
    // `inviteClientUser` (or by the seed script). This disables Better
    // Auth's `/sign-up/email` endpoint outright, so it can't be called even
    // by a direct, unauthenticated POST.
    disableSignUp: true,
    // Powers the client-invite flow (`inviteClientUser`, §5): we call
    // `auth.api.requestPasswordReset` ourselves and route the user to our own
    // `/set-password?token=...` page rather than Better Auth's default
    // `/reset-password/:token` callback route.
    sendResetPassword: async ({ user, token }) => {
      const setPasswordUrl = `${env.NEXT_PUBLIC_APP_URL}/set-password?token=${token}`;
      if (!resend) {
        // RESEND_API_KEY is not configured in this environment — log instead
        // of crashing or silently dropping the invite.
        console.log(`[auth] password reset link for ${user.email}: ${setPasswordUrl}`);
        return;
      }
      await resend.emails.send({
        from: "PKP Hub <onboarding@resend.dev>",
        to: user.email,
        subject: "Set your PKP Hub password",
        text: `Set your password here: ${setPasswordUrl}`,
      });
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        input: false,
        defaultValue: "client",
      },
      // Ikut dibawa ke objek sesi supaya `getSession` di auth-guards bisa
      // menolak user terarsip tanpa satu query tambahan di setiap request.
      // `input: false` — tidak ada payload dari klien yang boleh menyetelnya.
      archivedAt: {
        type: "date",
        input: false,
        required: false,
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
