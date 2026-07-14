import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIDR, formatTanggalIndo } from "@/lib/format";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/labels";

export type PortalPaymentRow = {
  id: string;
  amount: number;
  paidAt: string;
  method: string;
  receiptNumber: string;
  downloadUrl: string | null;
};

/**
 * Pembayaran di portal klien: read-only, dan HANYA baris yang tidak dibatalkan
 * (`listPaymentsForProject` sudah menyaringnya untuk peran `client`). Baris
 * batal bukan bagian dari catatan uang klien; menampilkannya cuma memancing
 * pertanyaan yang tidak perlu.
 */
export function PortalPayments({
  rows,
  projectValue,
  totalPaid,
  remaining,
  status,
  paymentNotes,
}: {
  rows: PortalPaymentRow[];
  projectValue: number | null;
  totalPaid: number;
  remaining: number;
  status: string;
  paymentNotes: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Nilai proyek</p>
          <p className="text-sm">{formatIDR(projectValue)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sudah dibayar</p>
          <p className="text-sm">{formatIDR(totalPaid)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sisa</p>
          <p className="text-sm">{formatIDR(remaining)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="text-sm">{paymentStatusLabel[status] ?? status}</p>
        </div>
      </div>

      {paymentNotes ? (
        <div>
          <p className="text-xs text-muted-foreground">Catatan</p>
          <p className="text-sm">{paymentNotes}</p>
        </div>
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
              <TableHead>Kwitansi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatTanggalIndo(row.paidAt)}</TableCell>
                <TableCell>{formatIDR(row.amount)}</TableCell>
                <TableCell>{paymentMethodLabel[row.method] ?? row.method}</TableCell>
                <TableCell>
                  {row.downloadUrl ? (
                    <a
                      href={row.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline underline-offset-4"
                    >
                      {row.receiptNumber}
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.receiptNumber}
                    </span>
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
