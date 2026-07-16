"use client";

import { UsersIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import type { z } from "zod";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { ProjectForm } from "@/components/projects/project-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { projectInputSchema } from "@/lib/actions/projects-schemas";

type ProjectFormValues = z.infer<typeof projectInputSchema>;

type ProjectEditTarget = {
  id: string;
  title: string;
  clientId: string;
  surveyType: ProjectFormValues["surveyType"];
  locationLabel: string | null;
  assignedSurveyorId: string | null;
  orderDate: Date;
  description: string | null;
};

/**
 * Tambah / edit proyek dalam dialog — menggantikan halaman `/new` dan
 * `/[id]/edit`. Dialog tutup dan daftar/detail tersegarkan di tempat
 * (`ProjectForm` `onSuccess`).
 *
 * `project` menentukan mode (tambah vs edit), sama seperti `ProjectForm`.
 * `clients` di sini HARUS klien aktif untuk mode tambah (lihat pemanggil);
 * untuk mode edit pemanggil boleh menyertakan klien terarsip milik proyek
 * ini supaya tidak hilang dari dropdown.
 *
 * Saat mode tambah dan belum ada klien sama sekali, form digantikan
 * empty-state yang menawarkan `ClientFormDialog` — meniru empty-state di
 * halaman `/new` yang dihapus.
 *
 * Penegakan admin tetap di server (`createProject`/`updateProject` =
 * `adminActionClient`); komponen ini tidak menambah/mengubah pemeriksaan itu.
 */
export function ProjectFormDialog({
  clients,
  surveyors,
  project,
  trigger,
}: {
  clients: { id: string; name: string }[];
  surveyors: { id: string; name: string }[];
  project?: ProjectEditTarget;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const isEditing = !!project;

  const defaultTrigger = isEditing ? (
    <Button variant="outline" size="sm">
      Edit
    </Button>
  ) : (
    <Button>Proyek baru</Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? defaultTrigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit proyek" : "Proyek baru"}</DialogTitle>
          <DialogDescription>
            {isEditing ? project.title : "Buat proyek survey baru untuk seorang klien."}
          </DialogDescription>
        </DialogHeader>
        {!isEditing && clients.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="Belum ada klien"
            description="Proyek harus dimiliki oleh seorang klien. Buat klien terlebih dahulu sebelum membuat proyek."
            action={<ClientFormDialog trigger={<Button size="sm">Buat klien</Button>} />}
          />
        ) : (
          <ProjectForm
            clients={clients}
            surveyors={surveyors}
            project={project}
            onSuccess={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
