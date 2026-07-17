import { and, eq, isNull } from "drizzle-orm";
import { WrenchIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EquipmentFilters } from "@/components/equipment/equipment-filters";
import {
  EquipmentItemAccordion,
  type EquipmentItemAccordionRow,
} from "@/components/equipment/equipment-item-accordion";
import { EquipmentItemFormDialog } from "@/components/equipment/equipment-item-form-dialog";
import { EquipmentSummary } from "@/components/equipment/equipment-summary";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listEquipmentItemsForUser } from "@/lib/actions/equipment-items-logic";
import { listProjectsForUser, requireStaff } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { formatDuration, summarizeUnits, usageDurationMs } from "@/lib/equipment/derive";
import { downloadUrlFor } from "@/lib/storage";

export const metadata = { title: "Inventaris Alat" };

/**
 * Daftar alat, dikelompokkan per JENIS (spec 2026-07-16). `requireStaff()`
 * adalah gerbangnya — klien tidak pernah sampai ke sini.
 *
 * Kolom harga beli hanya masuk payload admin — `listEquipmentItemsForUser`
 * (lewat `listEquipmentForUser`) memangkasnya di level query untuk surveyor,
 * bukan disembunyikan di render.
 */
export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>;
}) {
  const filters = await searchParams;
  const user = await requireStaff();
  const isAdmin = user.role === "admin";

  const itemsWithUnits = await listEquipmentItemsForUser(user);

  const userProjects = await listProjectsForUser(user);
  const projectOptions = userProjects.map((p) => ({ id: p.id, title: p.title }));

  const surveyors = isAdmin
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.role, "surveyor"), isNull(users.archivedAt)))
    : [];

  // Ringkasan total dihitung SEBELUM filter diterapkan — kartunya sendiri
  // adalah quick-filter, jadi harus tetap menunjukkan total sesungguhnya.
  const overallSummary = summarizeUnits(itemsWithUnits.flatMap((it) => it.units));

  // Filter di level item: item tampil kalau ADA unit yang cocok filter; unit
  // yang tidak cocok tersembunyi di dalam accordion-nya, bukan item-nya yang
  // hilang seluruhnya.
  const filteredItems = itemsWithUnits
    .filter((it) => !filters.category || it.item.category === filters.category)
    .map((it) => ({
      ...it,
      units: it.units.filter((u) => {
        if (!filters.status) return true;
        if (filters.status === "terpinjam") return Boolean(u.activeUsage);
        return !u.activeUsage && u.condition === filters.status;
      }),
    }))
    .filter((it) => !filters.status || it.units.length > 0);

  const now = new Date();
  const rows: EquipmentItemAccordionRow[] = await Promise.all(
    filteredItems.map(async (it) => ({
      id: it.item.id,
      name: it.item.name,
      category: it.item.category,
      image: it.item.image ? await downloadUrlFor(it.item.image) : null,
      summary: summarizeUnits(it.units),
      units: it.units.map((unit) => ({
        id: unit.id,
        code: unit.code,
        serialNumber: unit.serialNumber,
        condition: unit.condition,
        notes: unit.notes,
        // Dua field ADMIN-ONLY: `listEquipmentForUser` memangkasnya dari bentuk
        // objeknya sendiri untuk surveyor, jadi `in` di sini bukan basa-basi.
        purchaseDate: "purchaseDate" in unit ? unit.purchaseDate : undefined,
        purchasePrice: "purchasePrice" in unit ? unit.purchasePrice : undefined,
        activeUsage: unit.activeUsage
          ? {
              usedByName: unit.activeUsage.usedByName,
              projectTitle: unit.activeUsage.projectTitle,
              usageId: unit.activeUsage.usageId,
              canReturn: isAdmin || unit.activeUsage.usedById === user.id,
              durationLabel: formatDuration(
                usageDurationMs({ startedAt: unit.activeUsage.startedAt, endedAt: null }, now),
              ),
            }
          : null,
        canBorrow: unit.condition === "tersedia" && !unit.activeUsage,
      })),
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
        action={isAdmin ? <EquipmentItemFormDialog /> : undefined}
      />

      <EquipmentSummary
        total={overallSummary.total}
        tersedia={overallSummary.tersedia}
        terpinjam={overallSummary.terpinjam}
        perawatan={overallSummary.perawatan}
        rusak={overallSummary.rusak}
        activeStatus={filters.status ?? ""}
      />

      <EquipmentFilters />

      <EquipmentItemAccordion
        items={rows}
        isAdmin={isAdmin}
        projectOptions={projectOptions}
        surveyors={surveyors}
        emptyMessage={
          <EmptyState
            icon={WrenchIcon}
            title={hasActiveFilter ? "Tidak ada alat yang cocok dengan filter" : "Belum ada alat"}
            description={
              hasActiveFilter
                ? "Coba ubah atau hapus filter yang aktif."
                : isAdmin
                  ? "Tambahkan jenis alat pertama untuk mulai mencatat unit & pemakaiannya."
                  : "Belum ada alat yang terdaftar."
            }
            action={
              isAdmin && !hasActiveFilter ? (
                <EquipmentItemFormDialog trigger={<Button size="sm">Tambah jenis alat</Button>} />
              ) : undefined
            }
          />
        }
      />
    </main>
  );
}
