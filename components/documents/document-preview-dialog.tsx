"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * In-app preview (Phase 4 brief): PDFs and images preview inside the
 * dialog; everything else just gets the download link (original file is
 * always downloadable regardless).
 */
export function DocumentPreviewDialog({
  name,
  downloadUrl,
  mimeType,
}: {
  name: string;
  downloadUrl: string;
  mimeType: string;
}) {
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const canPreview = isImage || isPdf;

  if (!canPreview) {
    return (
      <a href={downloadUrl} download={name} className="text-sm text-primary hover:underline">
        Unduh
      </a>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            Pratinjau
          </Button>
        }
      />
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] items-center justify-center overflow-auto rounded-md bg-muted/30">
          {isImage ? (
            // biome-ignore lint/performance/noImgElement: user-uploaded file, not an optimizable static asset
            <img src={downloadUrl} alt={name} className="max-h-[70vh] w-auto object-contain" />
          ) : (
            <object data={downloadUrl} type="application/pdf" className="h-[70vh] w-full">
              <p className="p-4 text-sm text-muted-foreground">
                Pratinjau PDF tidak didukung di browser ini.{" "}
                <a href={downloadUrl} download={name} className="text-primary hover:underline">
                  Unduh file
                </a>
                .
              </p>
            </object>
          )}
        </div>
        <a href={downloadUrl} download={name} className="text-sm text-primary hover:underline">
          Unduh file asli
        </a>
      </DialogContent>
    </Dialog>
  );
}
