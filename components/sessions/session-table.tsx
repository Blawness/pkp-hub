"use client";

import { XIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
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

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

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
  const { execute, isPending } = useAction(revokeSessionAction);

  if (rows.length === 0) {
    return <p className="py-12 text-center text-muted-foreground text-sm">Tidak ada sesi aktif.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
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
                <div className="font-medium text-sm">{row.userName}</div>
                <div className="text-muted-foreground text-xs">{row.userEmail}</div>
              </TableCell>
              <TableCell className="font-mono text-xs">{row.ipAddress ?? "—"}</TableCell>
              <TableCell className="text-xs">{uaLabel(row.userAgent)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(row.createdAt)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(row.expiresAt)}
              </TableCell>
              <TableCell>
                {row.userId !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={() => execute({ sessionId: row.id })}
                    title="Cabut sesi"
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
  );
}
