"use client";

import { CopyIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { duplicateProject } from "@/lib/actions/projects";

/**
 * Tombol duplikat proyek. Admin-only — client component
 * karena pakai useAction untuk optimisitic feedback.
 */
export function DuplicateProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { execute, isPending } = useAction(duplicateProject, {
    onSuccess: ({ data }) => {
      if (data?.project) {
        router.push(`/dashboard/projects/${data.project.id}`);
      }
    },
  });

  return (
    <Button variant="outline" size="sm" disabled={isPending} onClick={() => execute({ projectId })}>
      <CopyIcon className="size-4" />
      {isPending ? "Menyalin…" : "Duplikat"}
    </Button>
  );
}
