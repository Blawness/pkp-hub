"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  UserCogIcon,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  archiveUserAction,
  restoreUserAction,
  setUserNameAction,
  setUserPasswordAction,
  setUserRoleAction,
} from "@/lib/actions/users";
import type { ManagedUser } from "@/lib/actions/users-logic";
import { setUserNameSchema, setUserPasswordSchema } from "@/lib/actions/users-schemas";

type PasswordValues = z.infer<typeof setUserPasswordSchema>;
type NameValues = z.infer<typeof setUserNameSchema>;

/**
 * Aksi per-baris untuk seorang user.
 *
 * Aturan sebenarnya (admin terakhir, tidak boleh menyentuh diri sendiri) hidup
 * di server (`users-logic.ts`) dan diuji di sana. Di sini aturan itu hanya
 * DICERMINKAN sebagai item yang dinonaktifkan — supaya admin tidak ditawari
 * tombol yang pasti gagal. Menyembunyikan tombol bukan penegakan aturan; server
 * tetap menolak kalau permintaan yang sama datang lewat jalan lain.
 */
export function UserRowActions({
  user,
  isSelf,
  isLastActiveAdmin,
}: {
  user: ManagedUser;
  isSelf: boolean;
  isLastActiveAdmin: boolean;
}) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const setRole = useAction(setUserRoleAction, {
    onError: ({ error }) => window.alert(error.serverError ?? "Gagal mengubah role."),
  });
  const archive = useAction(archiveUserAction, {
    onError: ({ error }) => window.alert(error.serverError ?? "Gagal mengarsipkan."),
  });
  const restore = useAction(restoreUserAction, {
    onError: ({ error }) => window.alert(error.serverError ?? "Gagal memulihkan."),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(setUserPasswordSchema),
    defaultValues: { userId: user.id, password: "" },
  });

  const setPassword = useAction(setUserPasswordAction, {
    onSuccess: () => {
      reset({ userId: user.id, password: "" });
      setFormError(null);
      setPasswordOpen(false);
    },
    onError: ({ error }) => setFormError(error.serverError ?? "Gagal menyetel password."),
  });

  const {
    register: registerName,
    handleSubmit: handleSubmitName,
    reset: resetName,
    formState: { errors: nameErrors },
  } = useForm<NameValues>({
    resolver: zodResolver(setUserNameSchema),
    defaultValues: { userId: user.id, name: user.name },
  });

  const setName = useAction(setUserNameAction, {
    onSuccess: () => {
      setNameError(null);
      setNameOpen(false);
    },
    onError: ({ error }) => setNameError(error.serverError ?? "Gagal mengganti nama."),
  });

  function openNameDialog() {
    // Isi ulang dari prop, bukan dari sisa ketikan sebelumnya: dialog yang
    // ditutup tanpa disimpan harus dibuka lagi menampilkan nama yang berlaku.
    resetName({ userId: user.id, name: user.name });
    setNameError(null);
    setNameOpen(true);
  }

  // Klien dikelola di halaman Klien; di sini mereka hanya ditampilkan.
  const isClient = user.role === "client";
  const nextRole = user.role === "admin" ? "surveyor" : "admin";
  const lockedByLastAdmin = isLastActiveAdmin;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Aksi untuk ${user.name}`}>
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          {/* Berlaku untuk semua role, termasuk diri sendiri dan klien: nama
              tampilan tidak memindahkan akses siapa pun, jadi tak ada invarian
              yang perlu dijaga di sini. `clients.name` (nama di halaman Klien)
              adalah kolom lain dan tidak ikut berubah. */}
          <DropdownMenuItem onClick={openNameDialog}>
            <PencilIcon />
            Ganti nama
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={isClient || isSelf || lockedByLastAdmin || setRole.isPending}
            onClick={() => setRole.execute({ userId: user.id, role: nextRole })}
          >
            <UserCogIcon />
            {user.role === "admin" ? "Turunkan jadi Surveyor" : "Jadikan Admin"}
          </DropdownMenuItem>

          <DropdownMenuItem disabled={isClient} onClick={() => setPasswordOpen(true)}>
            <KeyRoundIcon />
            Setel ulang password
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {user.archivedAt ? (
            <DropdownMenuItem
              disabled={restore.isPending}
              onClick={() => restore.execute({ userId: user.id })}
            >
              <ArchiveRestoreIcon />
              Pulihkan akun
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              disabled={isSelf || lockedByLastAdmin || archive.isPending}
              onClick={() => archive.execute({ userId: user.id })}
            >
              <ArchiveIcon />
              Arsipkan akun
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={nameOpen} onOpenChange={setNameOpen}>
        <DialogContent>
          <form onSubmit={handleSubmitName((values) => setName.execute(values))}>
            <DialogHeader>
              <DialogTitle>Ganti nama</DialogTitle>
              <DialogDescription>
                Nama tampilan untuk {user.email}. Email dan role-nya tidak berubah.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 py-4">
              {nameError ? (
                <p role="alert" className="text-sm text-destructive">
                  {nameError}
                </p>
              ) : null}

              <Label htmlFor={`name-${user.id}`}>Nama</Label>
              <Input
                id={`name-${user.id}`}
                autoComplete="off"
                aria-invalid={!!nameErrors.name}
                {...registerName("name")}
              />
              {nameErrors.name ? (
                <p className="text-xs text-destructive">{nameErrors.name.message}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={setName.isPending}>
                {setName.isPending ? "Menyimpan…" : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit((values) => setPassword.execute(values))}>
            <DialogHeader>
              <DialogTitle>Setel ulang password</DialogTitle>
              <DialogDescription>
                Password baru untuk {user.name}. Semua sesi yang sedang berjalan milik akun ini akan
                langsung diputus.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 py-4">
              {formError ? (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              ) : null}

              <Label htmlFor={`password-${user.id}`}>Password baru</Label>
              <Input
                id={`password-${user.id}`}
                type="text"
                autoComplete="off"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Minimal 10 karakter.</p>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={setPassword.isPending}>
                {setPassword.isPending ? "Menyimpan…" : "Setel password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
