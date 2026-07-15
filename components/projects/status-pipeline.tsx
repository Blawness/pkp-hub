"use client";

import { CheckIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { StatusBadge } from "@/components/projects/status-badge";
import { StatusHistory, type StatusLogRow } from "@/components/projects/status-history";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { changeProjectStatus } from "@/lib/actions/projects";
import { projectStatusEnum } from "@/lib/actions/projects-schemas";
import { statusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

type ProjectStatus = (typeof projectStatusEnum.options)[number];

// Urutan tampilan pipeline = enum tanpa "dibatalkan" (status terminal di luar
// rantai maju). Ini metadata TAMPILAN saja; tabel transisi resmi tetap
// satu-satunya di `projects-logic.ts` (FORWARD_CHAIN) — jangan duplikasi
// logikanya, dan JANGAN impor file itu ke sini (kode server).
const PIPELINE = projectStatusEnum.options.filter((s) => s !== "dibatalkan");

/**
 * Menggantikan `status-changer.tsx`. Stepper visual + aksi status. Server tetap
 * satu-satunya penegak transisi (`changeProjectStatusForUser`); `allowedNextStatuses`
 * di sini hanya UX. Menu ⋯ (mundur/batalkan/aktifkan lagi) hanya untuk admin.
 */
export function StatusPipeline({
  projectId,
  currentStatus,
  allowedNextStatuses,
  isAdmin,
  logs,
}: {
  projectId: string;
  currentStatus: string;
  allowedNextStatuses: string[];
  isAdmin: boolean;
  logs: StatusLogRow[];
}) {
  const router = useRouter();
  const { executeAsync, isExecuting } = useAction(changeProjectStatus);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Aksi destruktif menunggu konfirmasi; simpan target di sini (null = tertutup).
  const [confirm, setConfirm] = useState<{ toStatus: ProjectStatus; label: string } | null>(null);

  const isCancelled = currentStatus === "dibatalkan";
  const currentIdx = PIPELINE.indexOf(currentStatus as (typeof PIPELINE)[number]);

  const forwardStatus =
    currentIdx !== -1 && currentIdx + 1 < PIPELINE.length ? PIPELINE[currentIdx + 1] : null;
  const canForward = forwardStatus !== null && allowedNextStatuses.includes(forwardStatus);

  const backwardStatus =
    currentIdx > 0 && allowedNextStatuses.includes(PIPELINE[currentIdx - 1])
      ? PIPELINE[currentIdx - 1]
      : null;
  const canCancel = allowedNextStatuses.includes("dibatalkan");
  const canReactivate = isCancelled && allowedNextStatuses.includes("baru");
  const hasMenu = isAdmin && (backwardStatus !== null || canCancel || canReactivate);

  async function run(toStatus: ProjectStatus) {
    setError(null);
    const result = await executeAsync({ projectId, toStatus });
    if (result?.serverError) {
      setError(result.serverError);
      return false;
    }
    router.refresh();
    return true;
  }

  const noActions = !canForward && !hasMenu;

  return (
    <div className="flex flex-col gap-3">
      {/* Stepper */}
      <ol className="flex items-center gap-1 overflow-x-auto overflow-y-hidden pb-1">
        {PIPELINE.map((status, i) => {
          const done = currentIdx !== -1 && i < currentIdx;
          const current = i === currentIdx;
          return (
            <li key={status} className="flex shrink-0 items-center gap-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
                  current && "bg-primary text-primary-foreground",
                  done && "bg-primary/15 text-foreground",
                  !current && !done && "bg-muted text-muted-foreground",
                  isCancelled && "opacity-40",
                )}
              >
                {done ? <CheckIcon className="size-3" /> : null}
                {statusLabel[status] ?? status}
              </span>
              {i < PIPELINE.length - 1 ? (
                <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/40" />
              ) : null}
            </li>
          );
        })}
        {isCancelled ? (
          <li className="shrink-0 pl-2">
            <StatusBadge status="dibatalkan" />
          </li>
        ) : null}
      </ol>

      {/* Aksi */}
      <div className="flex flex-wrap items-center gap-2">
        {canForward && forwardStatus ? (
          <Button size="sm" disabled={isExecuting} onClick={() => run(forwardStatus)}>
            {isExecuting
              ? "Menyimpan…"
              : `Lanjut ke: ${statusLabel[forwardStatus] ?? forwardStatus} →`}
          </Button>
        ) : null}

        {hasMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Aksi status lain"
                  disabled={isExecuting}
                >
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {backwardStatus ? (
                <DropdownMenuItem onSelect={() => run(backwardStatus)}>
                  Mundur ke {statusLabel[backwardStatus] ?? backwardStatus}
                </DropdownMenuItem>
              ) : null}
              {canReactivate ? (
                <DropdownMenuItem
                  onSelect={() => setConfirm({ toStatus: "baru", label: "Aktifkan lagi proyek" })}
                >
                  Aktifkan lagi
                </DropdownMenuItem>
              ) : null}
              {canCancel ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirm({ toStatus: "dibatalkan", label: "Batalkan proyek" })}
                >
                  Batalkan proyek
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {noActions ? (
          <p className="text-sm text-muted-foreground">
            {currentStatus === "selesai"
              ? "Proyek selesai."
              : "Tidak ada transisi status yang tersedia untuk peran Anda saat ini."}
          </p>
        ) : null}

        <button
          type="button"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? "Sembunyikan riwayat" : "Riwayat"}
        </button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {showHistory ? (
        <div className="rounded-md border p-3">
          <StatusHistory logs={logs} />
        </div>
      ) : null}

      {/* Konfirmasi aksi destruktif */}
      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.label}</DialogTitle>
            <DialogDescription>
              {confirm?.toStatus === "dibatalkan"
                ? "Proyek akan ditandai dibatalkan. Kamu tetap bisa mengaktifkannya lagi nanti."
                : "Proyek yang dibatalkan akan dikembalikan ke status Baru."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirm(null)}
              disabled={isExecuting}
            >
              Batal
            </Button>
            <Button
              size="sm"
              variant={confirm?.toStatus === "dibatalkan" ? "destructive" : "default"}
              disabled={isExecuting}
              onClick={async () => {
                if (!confirm) return;
                const ok = await run(confirm.toStatus);
                if (ok) setConfirm(null);
              }}
            >
              {isExecuting ? "Menyimpan…" : "Ya, lanjut"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
