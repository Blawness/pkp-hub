import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOwnerDashboardData, getSurveyorDashboardData } from "@/lib/actions/dashboard-logic";
import { requireStaff } from "@/lib/auth-guards";
import { formatIDR } from "@/lib/format";
import { statusLabel, surveyTypeLabel } from "@/lib/labels";

/**
 * Dashboard Ringkasan (PRD §3 Feature 7), per-role content.
 *
 * The role branch below is a Server Component conditional: for a surveyor,
 * `getOwnerDashboardData` (which reads `projectValue`/`paymentStatus`) is
 * never even called, and `getSurveyorDashboardData`'s return type has no
 * finance fields at all (see `dashboard-logic.ts`) — so no finance figure
 * can be serialized into a surveyor's page output, by construction, not by
 * client-side hiding.
 */
export default async function DashboardPage() {
  const user = await requireStaff();

  if (user.role === "owner") {
    const data = await getOwnerDashboardData(user);
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-xl font-medium">Dashboard</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Total nilai proyek aktif
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-medium">
              {formatIDR(data.totalActiveValue)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Total belum lunas</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-medium">
              {formatIDR(data.totalUnpaid)}
            </CardContent>
          </Card>
          {Object.entries(data.countsByStatus).map(([status, count]) => (
            <Card key={status}>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  {statusLabel[status] ?? status}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-medium">{count}</CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Proyek terbaru</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.latestProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada proyek.</p>
            ) : (
              data.latestProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/projects/${p.id}`}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <span>
                    <span className="font-medium">{p.title}</span>
                    <span className="text-muted-foreground"> · {p.clientName}</span>
                  </span>
                  <Badge variant="secondary">{statusLabel[p.status] ?? p.status}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  // Surveyor.
  const data = await getSurveyorDashboardData(user);
  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-medium">Dashboard</h1>
      <p className="text-sm text-muted-foreground">
        {data.needsActionCount} proyek menunggu tindakan Anda.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Proyek yang ditugaskan ke Anda</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {data.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada proyek yang ditugaskan.</p>
          ) : (
            data.projects.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/projects/${p.id}`}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span>
                  <span className="font-medium">{p.title}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {p.clientName} · {surveyTypeLabel[p.surveyType] ?? p.surveyType}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  {p.needsAction ? <Badge variant="destructive">Perlu tindakan</Badge> : null}
                  <Badge variant="secondary">{statusLabel[p.status] ?? p.status}</Badge>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
