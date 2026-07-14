"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { optionsFromLabels, SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { recordPayment } from "@/lib/actions/payments";
import type { PaymentMethod } from "@/lib/actions/payments-schemas";
import { paymentMethodLabel } from "@/lib/labels";

type FormValues = {
  amount: string;
  paidAt: string;
  method: PaymentMethod;
  note: string;
};

function today(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function RecordPaymentDialog({
  projectId,
  disabled,
}: {
  projectId: string;
  /** True kalau nilai proyek belum diisi — mencatat uang tanpa nilai proyek tidak punya arti. */
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { amount: "", paidAt: today(), method: "transfer", note: "" },
  });
  const { executeAsync } = useAction(recordPayment);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const amount = Number(values.amount.trim());
    if (!Number.isInteger(amount) || amount <= 0) {
      setFormError("Jumlah pembayaran harus bilangan bulat lebih dari 0.");
      return;
    }

    const result = await executeAsync({
      projectId,
      amount,
      paidAt: values.paidAt,
      method: values.method,
      note: values.note.trim() || undefined,
    });

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali data yang dimasukkan.");
      return;
    }

    reset({ amount: "", paidAt: today(), method: "transfer", note: "" });
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button disabled={disabled} className="w-fit">
            Catat pembayaran
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat pembayaran</DialogTitle>
          <DialogDescription>
            Kwitansi ber-nomor otomatis diterbitkan. Kalau salah, batalkan lalu catat ulang — baris
            pembayaran tidak bisa diedit.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Jumlah (IDR)</Label>
            <Input id="amount" type="number" min={1} step={1} {...register("amount")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paidAt">Tanggal uang diterima</Label>
            <Input id="paidAt" type="date" {...register("paidAt")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="method">Metode</Label>
            <Controller
              control={control}
              name="method"
              render={({ field }) => (
                <SelectField
                  id="method"
                  className="w-full"
                  options={optionsFromLabels(paymentMethodLabel)}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Catatan</Label>
            <Textarea id="note" rows={2} placeholder="mis. DP 50% via BCA" {...register("note")} />
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
