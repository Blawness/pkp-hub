"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { VoidPaymentDialog } from "@/components/payments/void-payment-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { regenerateReceipt } from "@/lib/actions/payments";
import { formatIDR, formatTanggalIndo } from "@/lib/format";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/labels";

export type PaymentPanelRow = {
  id: string;
  amount: number;
  paidAt: string;
  method: string;
  note: string | null;
  receiptNumber: string;
  /** Sudah ditandatangani di server (presigned). Null = kwitansi belum terbit. */
  downloadUrl: string | null;
  voidedReason: string | null;
  isVoided: boolean;
};

export function PaymentsPanel({
  projectId,
  rows,
  projectValue,
  totalPaid,
  remaining,
  status,
}: {
  projectId: string;
  rows: PaymentPanelRow[];
  projectValue: number | null;
  totalPaid: number;
  remaining: number;
  status: string;
}) {
  const router = useRouter();
  const { executeAsync, isPending } = useAction(regenerateReceipt);
  const hasValue = projectValue != null && projectValue > 0;
  const overpaid = hasValue && totalPaid > projectValue;

  const onRegenerate = async (paymentId: string) => {
    await executeAsync({ paymentId });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Nilai proyek</p>
          <p className="text-sm">{formatIDR(projectValue)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Terbayar</p>
          <p className="text-sm">{formatIDR(totalPaid)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sisa</p>
          <p className="text-sm">{formatIDR(remaining)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{paymentStatusLabel[status] ?? status}</Badge>
            {overpaid ? (
              <Badge variant="outline">
                Lebih bayar {formatIDR(totalPaid - (projectValue ?? 0))}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <RecordPaymentDialog projectId={projectId} disabled={!hasValue} />

      {!hasValue ? (
        <p className="text-sm text-muted-foreground">
          Isi nilai proyek dulu di form di atas — tanpa itu "sisa tagihan" dan "lunas" tidak punya
          arti.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada pembayaran tercatat.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Jumlah</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Catatan</TableHead>
              <TableHead>Kwitansi</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className={row.isVoided ? "text-muted-foreground" : undefined}>
                <TableCell>{formatTanggalIndo(row.paidAt)}</TableCell>
                <TableCell className={row.isVoided ? "line-through" : undefined}>
                  {formatIDR(row.amount)}
                </TableCell>
                <TableCell>{paymentMethodLabel[row.method] ?? row.method}</TableCell>
                <TableCell className="max-w-[220px] truncate">
                  {row.isVoided ? `Dibatalkan: ${row.voidedReason ?? "—"}` : (row.note ?? "—")}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.receiptNumber}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  {row.downloadUrl ? (
                    <Button
                      render={<a href={row.downloadUrl} target="_blank" rel="noreferrer" />}
                      variant="outline"
                      size="sm"
                    >
                      Unduh
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => onRegenerate(row.id)}
                    >
                      Buat kwitansi
                    </Button>
                  )}
                  {row.isVoided ? null : (
                    <VoidPaymentDialog paymentId={row.id} receiptNumber={row.receiptNumber} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
