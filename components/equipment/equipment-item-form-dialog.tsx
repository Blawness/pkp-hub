"use client";

import type { ReactElement } from "react";
import { useState } from "react";
import {
  type EquipmentItemEditTarget,
  EquipmentItemForm,
} from "@/components/equipment/equipment-item-form";
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
 * Tambah / edit jenis alat dalam dialog (spec 2026-07-16). `editing`
 * menentukan mode, sama seperti `EquipmentFormDialog` (unit).
 */
export function EquipmentItemFormDialog({
  editing,
  trigger,
}: {
  editing?: EquipmentItemEditTarget;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const isEditing = !!editing;

  const defaultTrigger = isEditing ? (
    <Button variant="outline" size="sm">
      Edit
    </Button>
  ) : (
    <Button>Tambah jenis alat</Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? defaultTrigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit jenis alat" : "Jenis alat baru"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? editing.name
              : "Tambahkan jenis alat baru. Unit fisiknya ditambahkan satu-satu setelah tersimpan."}
          </DialogDescription>
        </DialogHeader>
        <EquipmentItemForm editing={editing} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
