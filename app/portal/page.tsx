import { FolderKanbanIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listPortalProjects } from "@/lib/actions/portal-logic";
import { requireClient } from "@/lib/auth-guards";
import { statusLabel, surveyTypeLabel } from "@/lib/labels";

export const metadata = { title: "Proyek Saya" };

export default async function PortalPage() {
  const user = await requireClient();
  const projectRows = await listPortalProjects(user);

  return (
    <main className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-medium">Proyek Saya</h1>
        <p className="text-sm text-muted-foreground">Masuk sebagai {user.name}.</p>
      </div>

      {projectRows.length === 0 ? (
        <EmptyState
          icon={FolderKanbanIcon}
          title="Belum ada proyek"
          description="Proyek survey Anda akan tampil di sini setelah studio membuatnya."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {projectRows.map((p) => (
            <Link key={p.id} href={`/portal/projects/${p.id}`}>
              <Card className="transition hover:bg-muted/50">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{p.title}</CardTitle>
                  <Badge variant="secondary">{statusLabel[p.status] ?? p.status}</Badge>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {surveyTypeLabel[p.surveyType] ?? p.surveyType}
                  {p.locationLabel ? ` · ${p.locationLabel}` : ""}
                  {" · "}
                  {p.orderDate.toLocaleDateString("id-ID")}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
