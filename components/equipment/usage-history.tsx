import Link from "next/link";
import { ReturnButton } from "@/components/equipment/return-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type UsageHistoryRow = {
  id: string;
  projectId: string;
  projectTitle: string;
  usedByName: string;
  startedAt: Date;
  endedAt: Date | null;
  /** Dihitung di SERVER (`formatDuration(usageDurationMs(row, new Date()))`) — jangan di sini, supaya tidak ada mismatch hidrasi. */
  duration: string;
  note: string | null;
  /** True hanya untuk sesi yang sedang berjalan DAN caller boleh menutupnya (staf; surveyor hanya sesi miliknya sendiri). */
  canReturn: boolean;
};

/**
 * Riwayat pakai satu alat, terbaru dulu (sesuai urutan `rows` dari
 * `listUsageForEquipment`). Server Component murni — durasinya sudah dihitung
 * di server sebelum sampai ke sini (lihat `UsageHistoryRow.duration`).
 */
export function UsageHistory({ rows }: { rows: UsageHistoryRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada riwayat pakai.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proyek</TableHead>
              <TableHead>Dipakai oleh</TableHead>
              <TableHead>Mulai</TableHead>
              <TableHead>Selesai</TableHead>
              <TableHead>Durasi</TableHead>
              <TableHead>Catatan</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/dashboard/projects/${row.projectId}`} className="hover:underline">
                    {row.projectTitle}
                  </Link>
                </TableCell>
                <TableCell>{row.usedByName}</TableCell>
                <TableCell>{row.startedAt.toLocaleString("id-ID")}</TableCell>
                <TableCell>
                  {row.endedAt ? row.endedAt.toLocaleString("id-ID") : "Sedang dipakai"}
                </TableCell>
                <TableCell>{row.duration}</TableCell>
                <TableCell>{row.note ?? "—"}</TableCell>
                <TableCell>{row.canReturn ? <ReturnButton usageId={row.id} /> : null}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
