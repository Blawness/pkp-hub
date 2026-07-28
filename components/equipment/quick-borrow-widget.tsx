"use client";

import { ArrowDownIcon, Loader2Icon, ScanIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { borrowByCode } from "@/lib/actions/equipment";
import { cn } from "@/lib/utils";

/**
 * Quick borrow/return widget buat mobile. Surveyor ketik/scan kode alat,
 * langsung pinjam atau kembalikan tanpa harus scroll daftar panjang.
 *
 * Flow:
 * 1. Ketik kode → auto-search unit yang cocok
 * 2. Kalau tersedia → tombol "Pinjam" besar
 * 3. Kalau sedang dipakai user ini → tombol "Kembalikan" besar
 * 4. Feedback inline (berhasil/gagal), lalu reset
 */
export function QuickBorrowWidget({
  projectOptions,
}: {
  projectOptions: { id: string; title: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [projectId, setProjectId] = useState(projectOptions[0]?.id ?? "");
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const borrowAction = useAction(borrowByCode, {
    onSuccess: () => {
      setFeedback({ ok: true, msg: "Alat berhasil dipinjam." });
      setCode("");
      router.refresh();
    },
    onError: ({ error }) => {
      setFeedback({ ok: false, msg: error.serverError ?? "Gagal meminjam." });
    },
  });

  const isPending = borrowAction.isPending;

  function handleBorrow() {
    if (!code.trim() || !projectId) return;
    borrowAction.execute({
      code: code.trim().toUpperCase(),
      projectId,
      startedAt: new Date(),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ScanIcon className="size-4 text-primary" />
        Quick Borrow / Return
      </div>

      {/* Project selector — compact */}
      {projectOptions.length > 1 ? (
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          aria-label="Pilih proyek"
        >
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      ) : null}

      {/* Code input — large touch target */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Ketik kode alat…"
          className="flex-1 font-mono text-lg h-14"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.trim()) handleBorrow();
          }}
        />
        <Button
          size="lg"
          className="h-14 min-w-14 shrink-0"
          disabled={isPending || !code.trim()}
          onClick={handleBorrow}
        >
          {isPending ? (
            <Loader2Icon className="size-5 animate-spin" />
          ) : (
            <ArrowDownIcon className="size-5" />
          )}
        </Button>
      </div>

      {/* Feedback */}
      {feedback ? (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium",
            feedback.ok
              ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
          )}
        >
          {feedback.msg}
        </p>
      ) : null}
    </div>
  );
}
