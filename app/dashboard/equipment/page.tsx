import { WrenchIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EquipmentFilters } from "@/components/equipment/equipment-filters";
import { EquipmentTable } from "@/components/equipment/equipment-table";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listEquipmentForUser } from "@/lib/actions/equipment-logic";
import { requireStaff } from "@/lib/auth-guards";

export const metadata = { title: "Inventaris Alat" };

/**
 * Daftar alat. `requireStaff()` adalah gerbangnya — klien tidak pernah
 * sampai ke sini (redirect ke `/portal`), dan modul ini tidak punya rute
 * apa pun di bawah `/portal`.
 *
 * Kolom harga beli hanya dirender untuk admin, TAPI untuk surveyor field-nya
 * sendiri memang sudah tidak ada di baris — `listEquipmentForUser` memangkasnya
 * di level query (`equipment-logic.ts`). `isAdmin` di sini hanya mengatur
 * layout tabel.
 */
export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; condition?: string; status?: string }>;
}) {
  const filters = await searchParams;
  const user = await requireStaff();
  const isAdmin = user.role === "admin";

  const items = await listEquipmentForUser(user);
  const filtered = items.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.condition && item.condition !== filters.condition) return false;
    if (filters.status === "dipakai" && !item.activeUsage) return false;
    if (filters.status === "tersedia" && item.activeUsage) return false;
    return true;
  });

  const rows = filtered.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    serialNumber: item.serialNumber,
    condition: item.condition,
    purchasePrice: "purchasePrice" in item ? item.purchasePrice : undefined,
    activeUsage: item.activeUsage
      ? { usedByName: item.activeUsage.usedByName, projectTitle: item.activeUsage.projectTitle }
      : null,
  }));

  const hasActiveFilter = Boolean(filters.category || filters.condition || filters.status);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Inventaris Alat"
        description={
          user.role === "surveyor"
            ? "Alat ukur yang bisa Anda pinjam."
            : "Seluruh alat ukur studio."
        }
        action={
          isAdmin ? <ButtonLink href="/dashboard/equipment/new">Tambah alat</ButtonLink> : undefined
        }
      />

      <EquipmentTable
        rows={rows}
        isAdmin={isAdmin}
        toolbar={<EquipmentFilters />}
        emptyMessage={
          <EmptyState
            icon={WrenchIcon}
            title={hasActiveFilter ? "Tidak ada alat yang cocok dengan filter" : "Belum ada alat"}
            description={
              hasActiveFilter
                ? "Coba ubah atau hapus filter yang aktif."
                : isAdmin
                  ? "Tambahkan alat pertama untuk mulai mencatat pemakaiannya."
                  : "Belum ada alat yang terdaftar."
            }
            action={
              isAdmin && !hasActiveFilter ? (
                <ButtonLink size="sm" href="/dashboard/equipment/new">
                  Tambah alat
                </ButtonLink>
              ) : undefined
            }
          />
        }
      />
    </main>
  );
}
