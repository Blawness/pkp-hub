import { statusLabel } from "@/lib/labels";

export type StatusLogRow = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedByName: string;
  createdAt: Date;
};

/** Server-rendered: timestamp + who changed each status (PRD Feature 2). */
export function StatusHistory({ logs }: { logs: StatusLogRow[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada riwayat perubahan status.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {logs.map((log) => (
        <li key={log.id} className="flex items-baseline justify-between text-sm">
          <span>
            {log.fromStatus ? (
              <>
                {statusLabel[log.fromStatus] ?? log.fromStatus} →{" "}
                <span className="font-medium">{statusLabel[log.toStatus] ?? log.toStatus}</span>
              </>
            ) : (
              <span className="font-medium">{statusLabel[log.toStatus] ?? log.toStatus}</span>
            )}
            <span className="text-muted-foreground"> oleh {log.changedByName}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {log.createdAt.toLocaleString("id-ID")}
          </span>
        </li>
      ))}
    </ol>
  );
}
