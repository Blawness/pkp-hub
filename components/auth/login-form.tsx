"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DURATION_FAST, EASE_OUT_EXPO } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
  rememberMe: z.boolean(),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * Only accept `redirectTo` values that are a same-app relative path, e.g.
 * `/dashboard/projects/123`. Rejects absolute URLs, protocol-relative URLs
 * (`//evil.com`), and backslash tricks (`/\evil.com`) that browsers can
 * interpret as scheme-relative — anything that isn't unambiguously a local
 * path is dropped in favor of the role's default landing page, so this can
 * never become an open redirect.
 */
function sanitizeRedirectTo(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.startsWith("/\\")) return null;
  return value;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    const { data, error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      // `false` membuat Better Auth menyetel cookie sesi TANPA maxAge, jadi ia
      // ikut mati saat browser ditutup. `true` (default-nya) menyimpannya
      // selama `session.expiresIn` — 7 hari.
      rememberMe: values.rememberMe,
    });

    if (error || !data) {
      setFormError(error?.message ?? "Invalid email or password.");
      return;
    }

    const roleHome = data.user.role === "client" ? "/portal" : "/dashboard";
    const redirectTo = sanitizeRedirectTo(searchParams.get("redirectTo"));
    // Only honor `redirectTo` if it lands in the area the user's role is
    // actually allowed into — a client's stale deep-link into /dashboard
    // must not override the client's own portal home.
    const destination = redirectTo?.startsWith(roleHome) ? redirectTo : roleHome;
    router.push(destination);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <input
          id="rememberMe"
          type="checkbox"
          className="size-4 rounded border-input accent-primary"
          {...register("rememberMe")}
        />
        <Label htmlFor="rememberMe" className="text-sm font-normal">
          Ingat saya
        </Label>
      </div>

      {/*
        `role="alert"` membuat kegagalan login diumumkan screen reader begitu
        elemennya masuk DOM. Tanpa ini, satu-satunya penanda bahwa login gagal
        adalah teks merah — yang tidak terlihat oleh pengguna screen reader.
      */}
      <AnimatePresence>
        {formError ? (
          <motion.p
            role="alert"
            className="text-sm text-destructive"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_FAST, ease: EASE_OUT_EXPO }}
          >
            {formError}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Masuk..." : "Masuk"}
      </Button>
    </form>
  );
}
