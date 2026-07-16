"use client";

import type { ReactElement } from "react";
import { useState } from "react";
import { type EquipmentEditTarget, EquipmentForm } from "@/components/equipment/equipment-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Tambah / edit UNIT dalam dialog (spec 2026-07-16). `itemId`/`itemName`
 * selalu wajib — unit selalu ada di bawah satu jenis alat, baik saat
 * ditambah dari accordion daftar maupun diedit dari halaman detail unit.
 */
export function EquipmentFormDialog({
  itemId,
  itemName,
  editing,
  trigger,
}: {
  itemId: string;
  itemName: string;
  editing?: EquipmentEditTarget;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const isEditing = !!editing;

  const defaultTrigger = isEditing ? (
    <Button variant="outline">Edit</Button>
  ) : (
    <Button>Tambah unit</Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? defaultTrigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit unit" : "Unit baru"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? `${itemName} — ${editing.code}`
              : `Tambahkan unit fisik baru untuk ${itemName}.`}
          </DialogDescription>
        </DialogHeader>
        <EquipmentForm itemId={itemId} editing={editing} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
