"use client";

import { ImageIcon } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { optimizeToWebp } from "@/lib/image/optimize-to-webp";

type UploadTarget = { mode: "presigned" | "direct"; uploadUrl: string; publicUrl: string };

/**
 * Widget upload gambar alat (admin-only). Alur:
 *  1. Pilih file → konversi ke WebP di klien (resize 1024px, quality 0.8).
 *  2. POST metadata ke `/api/equipment/upload-init` untuk dapat upload target.
 *  3. PUT byte WebP langsung ke target (presigned R2 / route lokal).
 *  4. Simpan `publicUrl` ke form lewat `onChange`.
 *
 * Preview memakai `URL.createObjectURL` atas blob hasil konversi — ini bekerja
 * untuk KEDUA driver (URL R2 mentah tidak bisa dibuka langsung tanpa tanda
 * tangan). Untuk gambar yang SUDAH tersimpan (mode edit), `displayUrl` sudah
 * di-resolve di server (`downloadUrlFor`).
 */
export function EquipmentImageField({
  value,
  displayUrl,
  onChange,
}: {
  value: string | null;
  displayUrl: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(displayUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("File harus berupa gambar.");
      }
      const webp = await optimizeToWebp(file);
      if (webp.size > 5 * 1024 * 1024) {
        throw new Error("Gambar terlalu besar setelah dikompres (maks 5MB).");
      }

      const initRes = await fetch("/api/equipment/upload-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "image/webp", fileSize: webp.size }),
      });
      if (!initRes.ok) {
        const body = await initRes.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal memulai unggahan.");
      }
      const target: UploadTarget = await initRes.json();

      const putRes = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/webp" },
        body: webp,
      });
      if (!putRes.ok) {
        throw new Error("Gagal mengunggah gambar.");
      }

      setPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(webp);
      });
      onChange(target.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah gambar.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove() {
    setPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    onChange(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {preview ? (
            // biome-ignore lint/performance/noImgElement: gambar hasil upload, bukan aset statis yang bisa dioptimasi
            <img src={preview} alt="Pratinjau gambar alat" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Mengunggah..." : value ? "Ganti gambar" : "Unggah gambar"}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={handleRemove}
              >
                Hapus
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">Otomatis dikompres ke WebP. Maks 5MB.</p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handlePick} />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
