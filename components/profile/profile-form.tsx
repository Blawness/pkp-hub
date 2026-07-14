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
