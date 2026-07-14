"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { voidPayment } from "@/lib/actions/payments";

export function VoidPaymentDialog({
  paymentId,
  receiptNumber,
}: {
  paymentId: string;
  receiptNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  const { executeAsync } = useAction(voidPayment);

  const onSubmit = async ({ reason }: { reason: string }) => {
    setFormError(null);
    const result = await executeAsync({ paymentId, reason: reason.trim() });
    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Tulis alasan pembatalan (minimal 3 karakter).");
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Batalkan
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan {receiptNumber}?</DialogTitle>
          <DialogDescription>
            Barisnya tidak dihapus — ia ditandai dibatalkan dan berhenti dihitung. Kwitansinya
            diterbitkan ulang dengan cap DIBATALKAN. Untuk mengoreksi, catat pembayaran baru setelah
            ini.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Alasan pembatalan</Label>
            <Textarea id="reason" rows={2} {...register("reason")} />
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? "Membatalkan..." : "Batalkan pembayaran"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
