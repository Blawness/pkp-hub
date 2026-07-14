import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReceiptArchiveRow } from "@/lib/actions/payments-logic";
import { formatIDR, formatTanggalIndo } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/labels";

/** `ReceiptArchiveRow` ditambah URL presigned yang sudah dihitung di halaman. */
export type ReceiptArchiveViewRow = ReceiptArchiveRow & { downloadUrl: string | null };

/**
 * Tabel read-only semua kwitansi (admin-only) di tab "Kwitansi" Arsip Dokumen.
 * Sengaja terpisah dari `DocumentsTable`: kwitansi memuat nilai proyek dan
 * tidak boleh kelihatan oleh surveyor yang mengakses Arsip.
 */
export function ReceiptsArchive({ rows }: { rows: ReceiptArchiveViewRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada kwitansi yang diterbitkan.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>No. Kwitansi</TableHead>
          <TableHead>Tanggal</TableHead>
          <TableHead>Proyek</TableHead>
          <TableHead>Klien</TableHead>
          <TableHead>Metode</TableHead>
          <TableHead>Jumlah</TableHead>
          <TableHead className="text-right">Kwitansi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-mono text-xs">{row.receiptNumber}</TableCell>
            <TableCell>{formatTanggalIndo(row.paidAt)}</TableCell>
            <TableCell>{row.projectTitle ?? "—"}</TableCell>
            <TableCell>{row.clientName ?? "—"}</TableCell>
            <TableCell>{paymentMethodLabel[row.method] ?? row.method}</TableCell>
            <TableCell>{formatIDR(row.amount)}</TableCell>
            <TableCell className="text-right">
              {row.downloadUrl ? (
                <Button
                  render={<a href={row.downloadUrl} target="_blank" rel="noreferrer" />}
                  variant="outline"
                  size="sm"
                >
                  Unduh
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">belum terbit</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
