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
 * Tambah / edit alat dalam dialog — menggantikan halaman `/new` dan
 * `/[id]/edit`. Admin tidak perlu berpindah halaman: dialog tutup dan
 * daftar/detail tersegarkan di tempat (`EquipmentForm` `onSuccess`).
 *
 * `editing` menentukan mode (tambah vs edit), sama seperti `EquipmentForm`.
 * `trigger` opsional untuk memberi tombol pemicu sendiri (mis. ukuran/varian
 * berbeda di empty-state atau di detail alat); tanpa itu, dipakai tombol
 * bawaan sesuai mode.
 *
 * Penegakan admin tetap di server (`createEquipment`/`updateEquipment` =
 * `adminActionClient`); pemanggil hanya merender pemicu ini saat `isAdmin`.
 */
export function EquipmentFormDialog({
  editing,
  trigger,
}: {
  editing?: EquipmentEditTarget;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const isEditing = !!editing;

  const defaultTrigger = isEditing ? (
    <Button variant="outline">Edit</Button>
  ) : (
    <Button>Tambah alat</Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? defaultTrigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit alat" : "Alat baru"}</DialogTitle>
          <DialogDescription>
            {isEditing ? editing.name : "Tambahkan satu unit alat ukur ke inventaris."}
          </DialogDescription>
        </DialogHeader>
        <EquipmentForm editing={editing} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
