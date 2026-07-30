"use client";

import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BulkSessionActions } from "@/components/sessions/bulk-session-actions";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { revokeSessionAction } from "@/lib/actions/session";
import type { SessionRow } from "@/lib/actions/session-logic";
import { useAutoRefresh } from "@/lib/hooks/use-auto-refresh";
import { useToastAction } from "@/lib/hooks/use-toast-action";

/** Interval polling "live" monitoring (ms). */
const REFRESH_INTERVAL_MS = 15_000;

function uaLabel(ua: string | null): string {
  if (!ua) return "—";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return ua.slice(0, 40);
}

export function SessionTable({
  rows,
  currentUserId,
}: {
  rows: SessionRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { execute, isPending } = useToastAction(revokeSessionAction, {
    successMessage: "Sesi berhasil dicabut.",
  });

  // ID sesi yang bisa dipilih (bukan milik sendiri).
  const selectableIds = rows.map((r) => r.id).filter((id, i) => rows[i].userId !== currentUserId);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableIds);
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // "Live" monitoring: re-run server component (query listActiveSessions)
  // tiap 15s. Pause saat tab di-background (di-handle hook) dan saat revoke
  // sedang jalan agar tidak menabrak mutation.
  useAutoRefresh(() => router.refresh(), REFRESH_INTERVAL_MS, !isPending);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span>Otomatis diperbarui tiap {REFRESH_INTERVAL_MS / 1000}s</span>
        </div>
        <BulkSessionActions selectedIds={selectedIds} onDone={() => setSelectedIds([])} />
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground text-sm">Tidak ada sesi aktif.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="size-4 accent-primary"
                  />
                </TableHead>
                <TableHead>User</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Browser</TableHead>
                <TableHead>Masuk</TableHead>
                <TableHead>Kedaluwarsa</TableHead>
                <TableHead className="w-20">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.userId !== currentUserId ? (
                      <input
                        type="checkbox"
                        aria-label={`Pilih sesi ${row.userName}`}
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleOne(row.id)}
                        className="size-4 accent-primary"
                      />
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{row.userName}</div>
                    <div className="text-muted-foreground text-xs">{row.userEmail}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.ipAddress ?? "—"}</TableCell>
                  <TableCell className="text-xs">{uaLabel(row.userAgent)}</TableCell>
                  <TableCell>
                    <RelativeTime date={row.createdAt} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Intl.DateTimeFormat("id-ID", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(row.expiresAt)}
                  </TableCell>
                  <TableCell>
                    {row.userId !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isPending}
                        onClick={() => execute({ sessionId: row.id })}
                        title="Cabut sesi"
                        aria-label="Cabut sesi"
                      >
                        <XIcon className="size-4 text-red-500" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
