"use client";

import { useAction } from "next-safe-action/hooks";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { optionsFromLabels, SelectField } from "@/components/ui/select-field";
import { uploadDocument } from "@/lib/actions/documents";
import type { DocumentCategory } from "@/lib/actions/documents-schemas";
import { documentCategoryLabel } from "@/lib/labels";

type UploadTarget = { mode: "presigned" | "direct"; uploadUrl: string; publicUrl: string };

/**
 * Upload flow (Phase 4 brief): the file bytes never go through a server
 * action — this component first POSTs tiny JSON metadata to
 * `/api/documents/upload-init` to get an upload target (presigned R2 PUT
 * URL, or this app's own `/api/storage/[...key]` route for the local
 * driver), PUTs the bytes there directly, THEN calls the `uploadDocument`
 * server action to persist the metadata row.
 */
export function DocumentUpload({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("laporan");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { executeAsync } = useAction(uploadDocument);

  function pickFile(f: File) {
    setFile(f);
    setName((current) => current || f.name);
    setError(null);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
  }

  function onDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }

  async function handleUpload() {
    if (!file) {
      setError("Pilih file terlebih dahulu.");
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const contentType = file.type || "application/octet-stream";
      const initRes = await fetch("/api/documents/upload-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          fileName: file.name,
          contentType,
          fileSize: file.size,
        }),
      });
      if (!initRes.ok) {
        const body = await initRes.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal memulai unggahan.");
      }
      const target: UploadTarget = await initRes.json();

      const putRes = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error("Gagal mengunggah file.");
      }

      const result = await executeAsync({
        projectId,
        name: name.trim() || file.name,
        category,
        fileUrl: target.publicUrl,
        fileSize: file.size,
        mimeType: contentType,
      });
      if (result?.serverError) {
        throw new Error(result.serverError);
      }
      if (result?.validationErrors) {
        throw new Error("Periksa kembali data dokumen.");
      }

      setFile(null);
      setName("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah file.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`flex h-20 w-full flex-col items-center justify-center rounded-md border text-sm text-muted-foreground transition-colors ${
          isDragging ? "border-ring bg-muted" : "border-input"
        }`}
      >
        {file ? file.name : "Klik atau seret file ke sini untuk mengunggah"}
        <input ref={inputRef} type="file" className="hidden" onChange={onInputChange} />
      </button>

      {file ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="doc-name">Nama dokumen</Label>
            <Input id="doc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-category">Kategori</Label>
            <SelectField
              id="doc-category"
              options={optionsFromLabels(documentCategoryLabel)}
              value={category}
              onValueChange={(value) => setCategory(value as DocumentCategory)}
            />
          </div>
          <Button type="button" onClick={handleUpload} disabled={isUploading}>
            {isUploading ? "Mengunggah..." : "Unggah"}
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
