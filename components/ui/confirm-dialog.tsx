"use client";

import { type ReactElement, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Dialog konfirmasi generik. `onConfirm` boleh async dan mengembalikan
 * `{ error }` untuk menampilkan pesan tanpa menutup dialog; mengembalikan
 * `void`/tanpa error akan menutupnya. Dibangun di atas `Dialog` yang ada
 * (belum ada `alert-dialog` di repo ini).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Konfirmasi",
  confirmVariant = "default",
  onConfirm,
}: {
  trigger: ReactElement;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary";
  onConfirm: () => Promise<{ error?: string } | void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    const result = await onConfirm();
    setPending(false);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Batal</DialogClose>
          <Button variant={confirmVariant} disabled={pending} onClick={handleConfirm}>
            {pending ? "Memproses…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
