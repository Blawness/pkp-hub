import { UsersIcon } from "lucide-react";
import Link from "next/link";
import { clientsColumns } from "@/components/clients/clients-columns";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { listClients } from "@/lib/actions/clients-logic";

export const metadata = { title: "Klien" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const rows = await listClients({ includeArchived: showArchived });

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Klien</h1>
          <p className="text-sm text-muted-foreground">
            Kelola data klien perorangan dan perusahaan.
          </p>
        </div>
        <Button render={<Link href="/dashboard/clients/new">Klien baru</Link>} />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={showArchived ? "outline" : "secondary"}
          size="sm"
          render={<Link href="/dashboard/clients">Aktif</Link>}
        />
        <Button
          variant={showArchived ? "secondary" : "outline"}
          size="sm"
          render={<Link href="/dashboard/clients?archived=1">Termasuk yang diarsipkan</Link>}
        />
      </div>

      <DataTable
        columns={clientsColumns}
        data={rows}
        emptyMessage={
          <EmptyState
            icon={UsersIcon}
            title={showArchived ? "Belum ada klien" : "Belum ada klien aktif"}
            description="Tambahkan klien pertama untuk mulai mengelola proyek survey."
            action={
              <Button size="sm" render={<Link href="/dashboard/clients/new">Klien baru</Link>} />
            }
          />
        }
      />
    </main>
  );
}
