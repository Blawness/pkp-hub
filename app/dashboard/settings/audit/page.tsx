import { AuditLogTable } from "@/components/audit/audit-log-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { ENTITY_TYPES, listAuditLogs } from "@/lib/actions/audit-logic";
import { getRbacContext } from "@/lib/rbac/context";

export const metadata = { title: "Log Audit" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ page?: string; entityType?: string }>;

export default async function AuditLogPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const ctx = await getRbacContext();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const entityType = searchParams.entityType ?? undefined;

  const { rows, total } = await listAuditLogs(ctx, { page, entityType });
  const totalPages = Math.ceil(total / 25);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Log Audit"
        description={`${total} catatan aktivitas — siapa melakukan apa, kapan, dari mana.`}
      />

      <AuditLogTable
        rows={rows}
        currentPage={page}
        totalPages={totalPages}
        entityType={entityType}
        entityTypes={[...ENTITY_TYPES]}
      />
    </main>
  );
}
