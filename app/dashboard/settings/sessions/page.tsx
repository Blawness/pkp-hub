import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { SessionTable } from "@/components/sessions/session-table";
import { listActiveSessions } from "@/lib/actions/session-logic";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";

export const metadata = { title: "Sesi Aktif" };
export const dynamic = "force-dynamic";

/**
 * Sesi aktif — superuser-only. Menampilkan semua sesi yang belum
 * expired dan memungkinkan pencabutan sesi user lain.
 */
export default async function SessionsPage() {
  const ctx = await getRbacContext();
  // `session.read` superuser-only: admin yang mengetik URL ini harus
  // dipantulkan dengan halus, bukan disuguhi 500 dari assertCan (BUG-003).
  if (!can(ctx, "session.read")) redirect("/dashboard/settings/users");
  const rows = await listActiveSessions(ctx);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Sesi Aktif"
        description={`${rows.length} sesi sedang login. Cabut sesi yang mencurigakan.`}
      />

      <SessionTable rows={rows} currentUserId={ctx.user.id} />
    </main>
  );
}
