import Link from "next/link";
import type { z } from "zod";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import type { StatusLogRow } from "@/components/projects/status-history";
import { StatusPipeline } from "@/components/projects/status-pipeline";
import { SurveyorAssignDialog } from "@/components/projects/surveyor-assign-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { projectInputSchema } from "@/lib/actions/projects-schemas";
import { paymentStatusLabel, surveyTypeLabel } from "@/lib/labels";

type ProjectFormValues = z.infer<typeof projectInputSchema>;

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/**
 * Panel ringkasan yang menggantikan tab Overview. Selalu tampil di atas tab —
 * memuat info yang paling sering dipantau: status (pipeline), progres fase,
 * surveyor, dan sisa bayar (admin). Detail jarang-lihat disembunyikan di
 * <details>. Server component; interaktivitas ada di island (StatusPipeline,
 * SurveyorAssignDialog).
 */
export function ProjectSummary({
  projectId,
  title,
  surveyType,
  clientId,
  clientName,
  surveyorName,
  assignedSurveyorId,
  surveyors,
  clients,
  editProject,
  isAdmin,
  canEdit,
  status,
  allowedNextStatuses,
  logs,
  progressPercent,
  phasesDone,
  phasesTotal,
  remaining,
  paymentStatus,
  locationLabel,
  orderDate,
  description,
}: {
  projectId: string;
  title: string;
  surveyType: string;
  clientId: string | null;
  clientName: string | null;
  surveyorName: string;
  assignedSurveyorId: string | null;
  surveyors: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  editProject: {
    id: string;
    title: string;
    clientId: string;
    surveyType: ProjectFormValues["surveyType"];
    locationLabel: string | null;
    assignedSurveyorId: string | null;
    orderDate: Date;
    description: string | null;
  };
  isAdmin: boolean;
  canEdit: boolean;
  status: string;
  allowedNextStatuses: string[];
  logs: StatusLogRow[];
  progressPercent: number | null;
  phasesDone: number;
  phasesTotal: number;
  remaining: number | null;
  paymentStatus: string | null;
  locationLabel: string | null;
  orderDate: Date;
  description: string | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6">
        {/* Baris judul */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium">{title}</h1>
            <p className="text-sm text-muted-foreground">
              {clientName ? (
                clientId ? (
                  <Link href={`/dashboard/clients/${clientId}`} className="hover:underline">
                    {clientName}
                  </Link>
                ) : (
                  clientName
                )
              ) : (
                "Klien tidak ditemukan"
              )}
              {" · "}
              {surveyTypeLabel[surveyType] ?? surveyType}
            </p>
          </div>
          {canEdit ? (
            <ProjectFormDialog clients={clients} surveyors={surveyors} project={editProject} />
          ) : null}
        </div>

        {/* Status pipeline */}
        <StatusPipeline
          projectId={projectId}
          currentStatus={status}
          allowedNextStatuses={allowedNextStatuses}
          isAdmin={isAdmin}
          logs={logs}
        />

        {/* Progres + surveyor + bayar */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Progres fase</p>
            {progressPercent === null ? (
              <p className="text-sm text-muted-foreground">Belum ada fase.</p>
            ) : (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {progressPercent}% · {phasesDone} dari {phasesTotal} fase selesai
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Surveyor</p>
            <div className="flex items-center gap-1">
              <span className="text-sm">{surveyorName}</span>
              {isAdmin ? (
                <SurveyorAssignDialog
                  projectId={projectId}
                  currentSurveyorId={assignedSurveyorId}
                  surveyors={surveyors}
                />
              ) : null}
            </div>
          </div>

          {remaining !== null ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">Sisa pembayaran</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{rupiah.format(remaining)}</span>
                {paymentStatus ? (
                  <Badge variant="secondary">
                    {paymentStatusLabel[paymentStatus] ?? paymentStatus}
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Detail jarang-lihat */}
        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
            <span className="group-open:hidden">▸ Detail proyek</span>
            <span className="hidden group-open:inline">▾ Detail proyek</span>
          </summary>
          <div className="grid gap-3 pt-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Lokasi</p>
              <p className="text-sm">{locationLabel ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tanggal order</p>
              <p className="text-sm">{orderDate.toLocaleDateString("id-ID")}</p>
            </div>
            {description ? (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Deskripsi</p>
                <p className="text-sm">{description}</p>
              </div>
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
