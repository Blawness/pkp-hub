"use client";

import { MessageSquareIcon, SendIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { createComment, markCommentsRead } from "@/lib/actions/comments";
import type { CommentWithAuthor } from "@/lib/actions/comments-logic";
import { roleLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Thread pesan proyek — dipakai di portal klien DAN dashboard staf.
 *
 * `currentUserId` menentukan sisi: pesan dari user ini dirender di kanan
 * (bubble primary), sisanya di kiri (bubble muted). Ini pola chat standar
 * yang langsung familiar tanpa perlu label "dari siapa" di setiap bubble —
 * tapi nama + role tetap ditampilkan di bawah bubble untuk konteks.
 *
 * Mark-as-read: saat component mount, panggil `markCommentsRead` sekali.
 * Ini fire-and-forget — kegagalan tidak menghalangi UI.
 */
export function ProjectMessages({
  projectId,
  currentUserId,
  initialComments,
}: {
  projectId: string;
  currentUserId: string;
  initialComments: CommentWithAuthor[];
}) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { executeAsync: executeCreate, isExecuting: isSending } = useAction(createComment);
  const { executeAsync: executeMarkRead } = useAction(markCommentsRead);

  // Mark as read saat pertama kali dibuka.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount, executeMarkRead is stable
  useEffect(() => {
    executeMarkRead({ projectId }).catch(() => {
      // Kegagalan mark-read tidak kritis — badge unread mungkin stale, tapi
      // thread tetap bisa dibaca dan ditulis.
    });
  }, [projectId]);

  // Auto-scroll ke bawah saat ada pesan baru.
  // biome-ignore lint/correctness/useExhaustiveDependencies: bottomRef is stable, only track comments.length
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) return;

    setFormError(null);
    const result = await executeCreate({ projectId, body: trimmed });

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali pesan yang dimasukkan.");
      return;
    }

    // Tambahkan ke state lokal (optimistic — server sudah return row).
    if (result?.data) {
      const newComment: CommentWithAuthor = {
        ...result.data,
        // Nama & role author = current user (kita yang kirim).
        authorName: "Anda",
        authorRole: "",
      };
      setComments((prev) => [...prev, newComment]);
    }

    setBody("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd + Enter = kirim (pola chat standar).
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Thread */}
      {comments.length === 0 ? (
        <EmptyState
          icon={MessageSquareIcon}
          title="Belum ada pesan"
          description="Mulai percakapan dengan studio tentang proyek ini."
        />
      ) : (
        <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto rounded-lg border border-border p-4">
          {comments.map((c) => {
            const isMine = c.authorId === currentUserId;
            return (
              <div key={c.id} className={cn("flex flex-col", isMine ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{c.body}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isMine ? "Anda" : c.authorName}
                  {!isMine && c.authorRole ? ` · ${roleLabel[c.authorRole] ?? c.authorRole}` : ""}
                  {" · "}
                  {new Date(c.createdAt).toLocaleString("id-ID", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <Textarea
            rows={3}
            placeholder="Tulis pesan… (Ctrl+Enter untuk kirim)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
          />
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={isSending || !body.trim()}
            >
              {isSending ? "Mengirim…" : "Kirim"}
              <SendIcon className="ml-1.5 size-3.5" aria-hidden />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
