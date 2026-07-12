"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-medium">Terjadi kesalahan</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Gagal memuat halaman ini. Silakan coba lagi.
      </p>
      <Button onClick={reset}>Coba lagi</Button>
    </main>
  );
}
