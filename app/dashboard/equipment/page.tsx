import { WrenchIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EquipmentFilters } from "@/components/equipment/equipment-filters";
import { EquipmentSummary } from "@/components/equipment/equipment-summary";
import { EquipmentTable } from "@/components/equipment/equipment-table";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listEquipmentForUser } from "@/lib/actions/equipment-logic";
import { requireStaff } from "@/lib/auth-guards";
import { downloadUrlFor } from "@/lib/storage";

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
  searchParams: Promise<{ category?: string; status?: string }>;
}) {
  const filters = await searchParams;
  const user = await requireStaff();
  const isAdmin = user.role === "admin";

  const items = await listEquipmentForUser(user);

  const summary = {
    total: items.length,
    terpinjam: items.filter((i) => i.activeUsage).length,
    tersedia: items.filter((i) => !i.activeUsage && i.condition === "tersedia").length,
    perawatan: items.filter((i) => !i.activeUsage && i.condition === "perawatan").length,
    rusak: items.filter((i) => !i.activeUsage && i.condition === "rusak").length,
  };

  const filtered = items.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    // Satu filter status, cermin dari kolom Status gabungan: "terpinjam" =
    // ada sesi aktif; nilai kondisi (tersedia/perawatan/rusak/pensiun) hanya
    // cocok untuk alat yang TIDAK sedang dipinjam — sama seperti tampilannya.
    if (filters.status) {
      if (filters.status === "terpinjam") {
        if (!item.activeUsage) return false;
      } else {
        if (item.activeUsage) return false;
        if (item.condition !== filters.status) return false;
      }
    }
    return true;
  });

  // URL R2 mentah tidak bisa dibuka tanpa tanda tangan — resolve dulu per baris.
  // Driver lokal mengembalikan URL yang sama (`/api/storage/...`).
  const rows = await Promise.all(
    filtered.map(async (item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      serialNumber: item.serialNumber,
      condition: item.condition,
      image: item.image ? await downloadUrlFor(item.image) : null,
      purchasePrice: "purchasePrice" in item ? item.purchasePrice : undefined,
      activeUsage: item.activeUsage
        ? { usedByName: item.activeUsage.usedByName, projectTitle: item.activeUsage.projectTitle }
        : null,
    })),
  );

  const hasActiveFilter = Boolean(filters.category || filters.status);

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

      <EquipmentSummary
        total={summary.total}
        tersedia={summary.tersedia}
        terpinjam={summary.terpinjam}
        perawatan={summary.perawatan}
        rusak={summary.rusak}
        activeStatus={filters.status ?? ""}
      />

      <EquipmentFilters />

      <EquipmentTable
        rows={rows}
        isAdmin={isAdmin}
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
