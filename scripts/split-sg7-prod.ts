/**
 * Koreksi sekali-pakai: pecah `SET GEOMATE SG7 GNSS` (1 baris) jadi 4 unit box.
 *
 * SG7 dikemas jadi 2 box kecil + 2 box besar. Tiap box = 1 unit fisik = 1 baris
 * di tabel, dengan `serialNumber` beda. No. seri SEMENTARA (acak) — ganti nanti
 * dengan yang asli.
 *
 * AMAN untuk prod:
 *  - Menghapus baris SET lama hanya kalau ada DAN tidak punya riwayat pakai.
 *  - INSERT 4 box idempotent (skip kalau namanya sudah ada).
 *  - DRY-RUN default; tulis hanya dengan `--commit`.
 *
 *   tsx --env-file=.env.prod scripts/split-sg7-prod.ts            # dry-run
 *   tsx --env-file=.env.prod scripts/split-sg7-prod.ts --commit   # tulis
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment, equipmentUsage } from "@/lib/db/schema";

const OLD_SET = "SET GEOMATE SG7 GNSS";

const BOXES = [
  { name: "SET GEOMATE SG7 GNSS - BOX KECIL 1", serialNumber: "SG7-K-3KA91F" },
  { name: "SET GEOMATE SG7 GNSS - BOX KECIL 2", serialNumber: "SG7-K-7QD24B" },
  { name: "SET GEOMATE SG7 GNSS - BOX BESAR 1", serialNumber: "SG7-B-1MZ58C" },
  { name: "SET GEOMATE SG7 GNSS - BOX BESAR 2", serialNumber: "SG7-B-9XP63E" },
].map((b) => ({
  name: b.name,
  category: "gps_rtk" as const,
  condition: "tersedia" as const,
  serialNumber: b.serialNumber,
  purchaseDate: "2025-01-01",
  notes:
    "Unit box dari SET GEOMATE SG7 GNSS. No. seri sementara (acak) — perbarui dengan yang asli.",
}));

async function main() {
  const commit = process.argv.includes("--commit");

  // Baris SET lama + cek riwayat pakai.
  const [old] = await db
    .select({ id: equipment.id, name: equipment.name })
    .from(equipment)
    .where(eq(equipment.name, OLD_SET));

  let canDelete = false;
  if (old) {
    const usages = await db
      .select({ equipmentId: equipmentUsage.equipmentId })
      .from(equipmentUsage)
      .where(eq(equipmentUsage.equipmentId, old.id));
    canDelete = usages.length === 0;
  }

  // Box yang belum ada.
  const existingBoxes = await db
    .select({ name: equipment.name })
    .from(equipment)
    .where(
      inArray(
        equipment.name,
        BOXES.map((b) => b.name),
      ),
    );
  const existingBoxNames = new Set(existingBoxes.map((e) => e.name));
  const toInsert = BOXES.filter((b) => !existingBoxNames.has(b.name));

  console.log(`Baris SET lama ditemukan : ${old ? "ya" : "tidak"}`);
  if (old && !canDelete) console.log("  ! SET lama punya riwayat pakai — TIDAK dihapus.");
  console.log(`Box akan dibuat          : ${toInsert.length}\n`);
  if (old && canDelete) console.log(`  - DELETE ${old.name}`);
  for (const b of toInsert) console.log(`  + INSERT ${b.name}  (SN: ${b.serialNumber})`);

  if (!commit) {
    console.log("\nDRY-RUN — tidak ada yang ditulis. Tambahkan --commit untuk menyimpan.");
    return;
  }

  if (old && canDelete) {
    await db.delete(equipment).where(eq(equipment.id, old.id));
  }
  if (toInsert.length) {
    await db.insert(equipment).values(toInsert);
  }
  console.log(`\n✅ Selesai: hapus ${old && canDelete ? 1 : 0}, insert ${toInsert.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
