import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditLogRow } from "@/lib/actions/audit-logic";
import { cn } from "@/lib/utils";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function DetailCell({ detail }: { detail: Record<string, unknown> | null }) {
  if (!detail) return <span className="text-muted-foreground">—</span>;

  const entries = Object.entries(detail).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <span className="max-w-64 truncate text-xs font-mono text-muted-foreground">
      {entries.map(([k, v]) => `${k}=${String(v)}`).join(", ")}
    </span>
  );
}

const actionBadge: Record<string, string> = {
  create: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
  update: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  delete: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  archive: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  restore: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  login: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
};

function ActionBadge({ action }: { action: string }) {
  const colors = actionBadge[action] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex rounded px-1.5 py-0.5 text-xs font-medium", colors)}>
      {action}
    </span>
  );
}

export function AuditLogTable({ rows }: { rows: AuditLogRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground text-sm">Belum ada catatan audit.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">Waktu</TableHead>
            <TableHead>Aktor</TableHead>
            <TableHead className="w-24">Aksi</TableHead>
            <TableHead>Entitas</TableHead>
            <TableHead>Detail</TableHead>
            <TableHead className="w-36">IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                {formatDate(row.createdAt)}
              </TableCell>
              <TableCell className="font-medium text-sm">
                {row.actorName ?? <span className="text-muted-foreground italic">Terhapus</span>}
              </TableCell>
              <TableCell>
                <ActionBadge action={row.action} />
              </TableCell>
              <TableCell className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">{row.entityType}</span>
                <span className="mx-1 text-muted-foreground">/</span>
                <span className="font-mono text-xs">{row.entityId.slice(0, 8)}…</span>
              </TableCell>
              <TableCell>
                <DetailCell detail={row.detail} />
              </TableCell>
              <TableCell className="font-mono text-muted-foreground text-xs">
                {row.ipAddress ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
