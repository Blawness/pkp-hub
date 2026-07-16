"use client";

import type { ReactElement } from "react";
import { useState } from "react";
import { ClientForm } from "@/components/clients/client-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ClientEditTarget = {
  id: string;
  name: string;
  type: "individual" | "company";
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

/**
 * Tambah / edit klien dalam dialog — menggantikan halaman `/new` dan
 * `/[id]/edit`. Dialog tutup dan daftar/detail tersegarkan di tempat
 * (`ClientForm` `onSuccess`).
 *
 * `client` menentukan mode (tambah vs edit), sama seperti `ClientForm`.
 * `trigger` opsional untuk memberi tombol pemicu sendiri (mis. di
 * empty-state); tanpa itu, dipakai tombol bawaan sesuai mode.
 *
 * Penegakan admin tetap di server (`createClient`/`updateClient` =
 * `adminActionClient`); komponen ini tidak menambah/mengubah pemeriksaan itu.
 */
export function ClientFormDialog({
  client,
  trigger,
}: {
  client?: ClientEditTarget;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const isEditing = !!client;

  const defaultTrigger = isEditing ? (
    <Button variant="outline">Edit</Button>
  ) : (
    <Button>Klien baru</Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? defaultTrigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit klien" : "Klien baru"}</DialogTitle>
          <DialogDescription>
            {isEditing ? client.name : "Tambahkan data klien baru."}
          </DialogDescription>
        </DialogHeader>
        <ClientForm client={client} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
