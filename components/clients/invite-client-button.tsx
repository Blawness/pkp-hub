"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { inviteClientUser } from "@/lib/actions/invite-client-user";

/**
 * Tombol "Undang ke portal" di halaman detail klien. Memanggil `inviteClientUser`
 * yang sudah ada (admin-only) — ia membuat user `client`, menautkannya ke baris
 * `clients`, lalu mengirim email set-password (atau mencatat URL-nya ke log
 * server bila `RESEND_API_KEY` kosong).
 *
 * Tiga state: sudah punya akun portal (teks statis), belum ada email (tombol
 * dinonaktifkan), atau siap diundang.
 */
export function InviteClientButton({
  clientId,
  email,
  hasUser,
  archived,
}: {
  clientId: string;
  email: string | null;
  hasUser: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { executeAsync, isExecuting } = useAction(inviteClientUser);

  if (archived) return null;
  if (hasUser) {
    return <p className="text-sm text-muted-foreground">Sudah punya akun portal</p>;
  }
  if (!email) {
    return (
      <Button variant="outline" disabled title="Tambahkan email klien dulu">
        Undang ke portal
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        disabled={isExecuting}
        onClick={async () => {
          setError(null);
          const result = await executeAsync({ clientId });
          if (result?.serverError) {
            setError(result.serverError);
            return;
          }
          setSent(true);
          router.refresh();
        }}
      >
        {isExecuting ? "Mengundang..." : "Undang ke portal"}
      </Button>
      {sent ? <p className="text-xs text-muted-foreground">Undangan dikirim ke {email}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
