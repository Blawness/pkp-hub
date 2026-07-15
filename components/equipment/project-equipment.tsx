import { WrenchIcon } from "lucide-react";
import Link from "next/link";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import { ReturnButton } from "@/components/equipment/return-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ProjectEquipmentUsageRow = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  usedByName: string;
  startedAt: Date;
  endedAt: Date | null;
  /** Dihitung di SERVER (`formatDuration(usageDurationMs(row, new Date()))`) — jangan di komponen klien. */
  duration: string;
  note: string | null;
  canReturn: boolean;
};

/**
 * Tab "Alat" di detail proyek. Server Component — tidak ada hook di sini,
 * dialog pinjam & tombol kembalikan adalah anak client-nya sendiri.
 *
 * `borrowable` dan `surveyors` dihitung oleh pemanggil (halaman detail
 * proyek) dari `listEquipmentForUser`, BUKAN di sini — komponen ini tidak
 * pernah menyentuh query inventaris sendiri.
 */
export function ProjectEquipment({
  projectId,
  usages,
  borrowable,
  canRecord,
  isAdmin,
  surveyors,
}: {
  projectId: string;
  usages: ProjectEquipmentUsageRow[];
  borrowable: { id: string; name: string }[];
  canRecord: boolean;
  isAdmin: boolean;
  surveyors: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {canRecord ? (
        <BorrowDialog
          projectId={projectId}
          borrowable={borrowable}
          isAdmin={isAdmin}
          surveyors={surveyors}
        />
      ) : null}

      {usages.length === 0 ? (
        <EmptyState
          icon={WrenchIcon}
          title="Belum ada alat dipakai"
          description="Riwayat pemakaian alat untuk proyek ini akan muncul di sini."
        />
      ) : (
        <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alat</TableHead>
                  <TableHead>Dipakai oleh</TableHead>
                  <TableHead>Mulai</TableHead>
                  <TableHead>Selesai</TableHead>
                  <TableHead>Durasi</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usages.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/equipment/${row.equipmentId}`}
                        className="font-medium hover:underline"
                      >
                        {row.equipmentName}
                      </Link>
                    </TableCell>
                    <TableCell>{row.usedByName}</TableCell>
                    <TableCell>{row.startedAt.toLocaleString("id-ID")}</TableCell>
                    <TableCell>
                      {row.endedAt ? row.endedAt.toLocaleString("id-ID") : "Sedang dipakai"}
                    </TableCell>
                    <TableCell>{row.duration}</TableCell>
                    <TableCell>{row.note ?? "—"}</TableCell>
                    <TableCell>
                      {row.canReturn ? <ReturnButton usageId={row.id} /> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
