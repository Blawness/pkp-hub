import { ClipboardCheckIcon, FolderKanbanIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProjectRow } from "@/components/dashboard/project-row";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusPipeline } from "@/components/dashboard/status-pipeline";
import { Reveal, Stagger } from "@/components/motion/reveal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdminDashboardData, getSurveyorDashboardData } from "@/lib/actions/dashboard-logic";
import { requireStaff } from "@/lib/auth-guards";
import { formatIDR } from "@/lib/format";
import { getRbacContext } from "@/lib/rbac/context";

export const metadata = { title: "Dashboard" };

/**
 * Dashboard Ringkasan (PRD §3 Feature 7), per-role content.
 *
 * The role branch below is a Server Component conditional: for a surveyor,
 * `getAdminDashboardData` (which reads `projectValue`/`paymentStatus`) is
 * never even called, and `getSurveyorDashboardData`'s return type has no
 * finance fields at all (see `dashboard-logic.ts`) — so no finance figure
 * can be serialized into a surveyor's page output, by construction, not by
 * client-side hiding.
 */
export default async function DashboardPage() {
  // `requireStaff` tetap dipakai untuk REDIRECT (klien dipantulkan ke /portal,
  // bukan disuguhi error); `ctx` yang menyetir scoping datanya.
  const user = await requireStaff();
  const ctx = await getRbacContext();

  if (user.role === "admin") {
    const data = await getAdminDashboardData(ctx);
    const activeCount = data.latestProjects.length;

    return (
      <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
        <PageHeader
          title="Dashboard"
          description="Ringkasan nilai proyek, tahapan pekerjaan, dan aktivitas terbaru studio."
        />

        <Stagger className="flex flex-col gap-6">
          <Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Total nilai proyek aktif"
                value={formatIDR(data.totalActiveValue)}
                hint="Di luar proyek selesai & dibatalkan"
                icon={FolderKanbanIcon}
              />
              <StatCard
                label="Total belum lunas"
                value={formatIDR(data.totalUnpaid)}
                hint="Tagihan berjalan yang belum tertagih penuh"
                icon={WalletIcon}
                tone={data.totalUnpaid > 0 ? "warning" : "default"}
              />
            </div>
          </Reveal>

          <Reveal>
            <Card>
              <CardHeader>
                <CardTitle>Tahapan proyek</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusPipeline counts={data.countsByStatus} />
              </CardContent>
            </Card>
          </Reveal>

          <Reveal>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle>Proyek terbaru</CardTitle>
                {activeCount > 0 ? (
                  <Link
                    href="/dashboard/projects"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Lihat semua
                  </Link>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {data.latestProjects.length === 0 ? (
                  <EmptyState
                    icon={FolderKanbanIcon}
                    title="Belum ada proyek"
                    description="Proyek yang baru dibuat akan muncul di sini."
                  />
                ) : (
                  data.latestProjects.map((p) => (
                    <ProjectRow
                      key={p.id}
                      id={p.id}
                      title={p.title}
                      status={p.status}
                      surveyType={p.surveyType}
                      clientName={p.clientName}
                      surveyorName={p.surveyorName}
                      orderDate={p.orderDate}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </Reveal>
        </Stagger>
      </main>
    );
  }

  // Surveyor: struktur sama, tanpa satu pun angka uang.
  const data = await getSurveyorDashboardData(ctx);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Dashboard"
        description="Proyek yang ditugaskan kepada Anda dan yang menunggu tindakan."
      />

      <Stagger className="flex flex-col gap-6">
        <Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Menunggu tindakan Anda"
              value={data.needsActionCount}
              hint="Status baru, dijadwalkan, atau data sudah diambil"
              icon={ClipboardCheckIcon}
              tone={data.needsActionCount > 0 ? "warning" : "default"}
            />
            <StatCard
              label="Total proyek ditugaskan"
              value={data.projects.length}
              icon={FolderKanbanIcon}
            />
          </div>
        </Reveal>

        <Reveal>
          <Card>
            <CardHeader>
              <CardTitle>Proyek yang ditugaskan ke Anda</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data.projects.length === 0 ? (
                <EmptyState
                  icon={FolderKanbanIcon}
                  title="Belum ada proyek yang ditugaskan"
                  description="Admin akan menugaskan Anda ke proyek survey saat tersedia."
                />
              ) : (
                data.projects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    id={p.id}
                    title={p.title}
                    status={p.status}
                    surveyType={p.surveyType}
                    clientName={p.clientName}
                    orderDate={p.orderDate}
                    needsAction={p.needsAction}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </Reveal>
      </Stagger>
    </main>
  );
}
