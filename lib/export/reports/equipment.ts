import { listEquipmentForUser, type EquipmentListItem } from "@/lib/actions/equipment-logic";
import {
  equipmentCategoryLabel,
  equipmentConditionLabel,
} from "@/lib/labels";
import type { SessionUser } from "@/lib/auth-guards";
import type { Column, ReportDefinition } from "@/lib/export/types";

/**
 * Satu baris per UNIT FISIK (bukan per jenis) — bentuk yang langsung bisa
 * difilter/di-pivot di Excel. Kolom harga beli TIDAK ADA di daftar kolom untuk
 * surveyor: `columns` menerima `user` dan memangkas di sini, mengikuti aturan
 * `listEquipmentForUser` (harga dipangkas di level query, bukan disembunyikan
 * di render).
 *
 * Filter aktif (kategori/status) ikut dipakai — ekspor = apa yang terlihat di
 * layar. `filterLabel` wajib dicetak di kepala laporan.
 */
export const equipmentReport: ReportDefinition<EquipmentListItem> = {
  title: "Laporan Inventaris Alat",
  filename: "inventaris-alat",

  columns: (user: SessionUser): Column<EquipmentListItem>[] => {
    const base: Column<EquipmentListItem>[] = [
      { header: "Kode", get: (u) => u.code, width: 90, format: "text" },
      { header: "Jenis", get: (u) => u.itemName, width: 150, format: "text" },
      {
        header: "Kategori",
        get: (u) => equipmentCategoryLabel[u.category] ?? u.category,
        width: 120,
        format: "text",
      },
      {
        header: "Kondisi",
        get: (u) => equipmentConditionLabel[u.condition] ?? u.condition,
        width: 90,
        format: "text",
      },
      {
        header: "Status pakai",
        get: (u) => (u.activeUsage ? `${u.activeUsage.usedByName} · ${u.activeUsage.projectTitle}` : "Tersedia"),
        width: 170,
        format: "text",
      },
      {
        header: "Dipakai sejak",
        get: (u) => (u.activeUsage ? u.activeUsage.startedAt : null),
        width: 90,
        format: "date",
      },
    ];

    // ADMIN-ONLY: kolom harga beli tidak pernah ada untuk surveyor.
    if (user.role === "admin") {
      base.push({
        header: "Harga beli",
        get: (u) => ("purchasePrice" in u ? (u.purchasePrice as number | null) : null),
        width: 110,
        align: "right",
        format: "currency",
      });
    }
    return base;
  },

  fetch: async (user: SessionUser, params: URLSearchParams) => {
    const category = params.get("category") ?? "";
    const status = params.get("status") ?? "";

    const all = await listEquipmentForUser(user);

    // Filter SAMA persis dengan app/dashboard/equipment/page.tsx.
    const rows = all.filter((u) => {
      if (category && u.category !== category) return false;
      if (status) {
        if (status === "terpinjam") return Boolean(u.activeUsage);
        return !u.activeUsage && u.condition === status;
      }
      return true;
    });

    const filterParts: string[] = [];
    if (category) filterParts.push(`Kategori: ${equipmentCategoryLabel[category] ?? category}`);
    if (status) {
      const statusLabel =
        status === "terpinjam" ? "Terpinjam" : (equipmentConditionLabel[status] ?? status);
      filterParts.push(`Status: ${statusLabel}`);
    }
    const filterLabel = filterParts.length ? filterParts.join(" · ") : null;

    // Footnote: ringkasan jumlah unit per kondisi (satu baris).
    const tersedia = rows.filter((u) => !u.activeUsage && u.condition === "tersedia").length;
    const terpinjam = rows.filter((u) => Boolean(u.activeUsage)).length;
    const perawatan = rows.filter((u) => !u.activeUsage && u.condition === "perawatan").length;
    const rusak = rows.filter((u) => !u.activeUsage && u.condition === "rusak").length;
    const footnote = `Total: ${rows.length} unit — ${tersedia} tersedia, ${terpinjam} terpinjam, ${perawatan} perawatan, ${rusak} rusak`;

    return { rows, filterLabel, footnote };
  },
};
