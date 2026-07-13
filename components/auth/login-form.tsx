"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
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
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    const { data, error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
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
        {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
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
          <p className="text-xs text-destructive">{errors.password.message}</p>
        ) : null}
      </div>
      <AnimatePresence>
        {formError ? (
          <motion.p
            className="text-sm text-destructive"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
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
