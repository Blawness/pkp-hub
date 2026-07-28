import { AuditLogTable } from "@/components/audit/audit-log-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { listAuditLogs } from "@/lib/actions/audit-logic";
import { getRbacContext } from "@/lib/rbac/context";

export const metadata = { title: "Log Audit" };
export const dynamic = "force-dynamic";

/**
 * Log audit — superuser-only. Digerbangi oleh `settings/layout.tsx` yang
 * hanya menampilkan tab ini kalau pemanggil punya `audit.read`.
 *
 * Menampilkan seluruh aktivitas yang terekam di `audit_log`: siapa
 * melakukan apa, ke entitas mana, kapan, dari IP mana.
 */
export default async function AuditLogPage() {
  const ctx = await getRbacContext();
  const { rows, total } = await listAuditLogs(ctx);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Log Audit"
        description={`${total} catatan aktivitas — siapa melakukan apa, kapan, dari mana. Hanya bisa diakses Superuser.`}
      />

      <AuditLogTable rows={rows} />
    </main>
  );
}
