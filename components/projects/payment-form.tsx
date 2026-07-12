"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updatePayment } from "@/lib/actions/finance";
import type { PaymentStatus } from "@/lib/actions/finance-schemas";
import { paymentStatusLabel } from "@/lib/labels";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type PaymentFormValues = {
  projectValue: string;
  paymentStatus: PaymentStatus;
  paymentNotes: string;
};

/**
 * Owner-only Keuangan form (PRD §3 Feature 5). Only ever rendered inside the
 * project detail page's `user.role === "owner"` branch (a Server Component
 * conditional) — never mounted at all for a surveyor, so no finance value
 * is ever serialized into a non-owner's RSC payload via this component.
 */
export function PaymentForm({
  projectId,
  projectValue,
  paymentStatus,
  paymentNotes,
}: {
  projectId: string;
  projectValue: number | null;
  paymentStatus: PaymentStatus;
  paymentNotes: string | null;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<PaymentFormValues>({
    defaultValues: {
      projectValue: projectValue != null ? String(projectValue) : "",
      paymentStatus,
      paymentNotes: paymentNotes ?? "",
    },
  });
  const { executeAsync } = useAction(updatePayment);

  const onSubmit = async (values: PaymentFormValues) => {
    setFormError(null);
    const trimmed = values.projectValue.trim();
    const parsedValue = trimmed === "" ? null : Number(trimmed);
    if (parsedValue != null && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
      setFormError("Nilai proyek harus berupa angka positif.");
      return;
    }

    const result = await executeAsync({
      projectId,
      projectValue: parsedValue,
      paymentStatus: values.paymentStatus,
      paymentNotes: values.paymentNotes.trim() || undefined,
    });

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali data yang dimasukkan.");
      return;
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-md flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="projectValue">Nilai proyek (IDR)</Label>
        <Input id="projectValue" type="number" min={0} step={1} {...register("projectValue")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="paymentStatus">Status pembayaran</Label>
        <select id="paymentStatus" className={selectClassName} {...register("paymentStatus")}>
          {Object.entries(paymentStatusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="paymentNotes">Catatan pembayaran</Label>
        <Textarea id="paymentNotes" rows={3} {...register("paymentNotes")} />
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="w-fit">
        {isSubmitting ? "Menyimpan..." : "Simpan"}
      </Button>
    </form>
  );
}
