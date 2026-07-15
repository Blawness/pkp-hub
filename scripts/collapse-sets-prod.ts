/**
 * Koreksi sekali-pakai: ciutkan perintilan drone & SG7 GNSS jadi 2 baris SET.
 *
 * Alasan: satu SET dipinjam sepaket, bukan per-aksesori. Import awal
 * (`import-inventaris-prod.ts`) sempat memecah tiap SET jadi sub-item; script
 * ini menghapus 18 sub-item itu dan menggantinya dengan 2 baris SET, isinya
 * dirinci di `notes`.
 *
 * AMAN untuk prod:
 *  - Hanya menghapus nama yang ada di `OBSOLETE` DAN tidak punya riwayat pakai
 *    (`equipment_usage`). Kalau ada usage, baris itu DILEWATI dan diperingatkan.
 *  - INSERT baris SET idempotent (skip kalau namanya sudah ada).
 *  - DRY-RUN default; tulis hanya dengan `--commit`.
 *
 *   tsx --env-file=.env.prod scripts/collapse-sets-prod.ts            # dry-run
 *   tsx --env-file=.env.prod scripts/collapse-sets-prod.ts --commit   # tulis
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment, equipmentUsage } from "@/lib/db/schema";

/** 18 sub-item yang di-flatten sebelumnya — akan dihapus dan diganti 2 SET. */
const OBSOLETE = [
  // drone
  "DRONE DJI MATRICE 4E",
  "DJI MATRICE 4E FLIGHT BATTERY",
  "DJI MATRICE 4E BATTERY CHARGING HUB",
  "DJI RC PLUS 2 ENTERPRISE ENHANCED (REMOTE CONTROL)",
  "CARD READER 2-IN-1 CABLETIME KONEKTOR USB-A DAN USB-C",
  "PROPELLER SPARE PART",
  "SD CARD SANDISK",
  // SG7 GNSS
  "RECEIVER GEOMATE SG7 GNSS",
  "TRIBRACH ADAPTOR",
  "EXTENSION POLE",
  "ADAPTOR TRIBRACH",
  "H.I TAPE - ROLL METER GEOMATE",
  "SET ADAPTOR CABLE A TO C DAN STEKER",
  "RTK HEIGHT MEASURING PLATE",
  "CABLE CHARGER CONTROLLER",
  "BRACKET CONTROLLER / POLE CLAMP (KLEM TIANG)",
  "GEOMATE FC2 HANDHELD CONTROLLER",
  "ANTENA UHF KQT450GT",
];

const SETS = [
  {
    name: "SET DRONE DJI MATRICE 4E",
    category: "drone" as const,
    condition: "tersedia" as const,
    purchaseDate: "2025-01-01",
    notes:
      "Isi 1 set: DRONE DJI MATRICE 4E (1), FLIGHT BATTERY (3), BATTERY CHARGING HUB (1), " +
      "DJI RC PLUS 2 REMOTE CONTROL (1), CARD READER 2-IN-1 CABLETIME (1), PROPELLER SPARE PART (2), " +
      "SD CARD SANDISK (3). Dipinjam sepaket.",
  },
  {
    name: "SET GEOMATE SG7 GNSS",
    category: "gps_rtk" as const,
    condition: "tersedia" as const,
    purchaseDate: "2025-01-01",
    notes:
      "Isi 1 set: RECEIVER GEOMATE SG7 GNSS (2), TRIBRACH ADAPTOR (2), EXTENSION POLE (2), " +
      "ADAPTOR TRIBRACH (2), H.I TAPE ROLL METER (3), SET ADAPTOR CABLE A-TO-C + STEKER (2), " +
      "RTK HEIGHT MEASURING PLATE (4), CABLE CHARGER CONTROLLER (4), BRACKET/POLE CLAMP (2), " +
      "GEOMATE FC2 HANDHELD CONTROLLER (2), ANTENA UHF KQT450GT (2). Dipinjam sepaket.",
  },
];

async function main() {
  const commit = process.argv.includes("--commit");

  // Baris obsolete yang benar-benar ada + cek riwayat pakai.
  const present = await db
    .select({ id: equipment.id, name: equipment.name })
    .from(equipment)
    .where(inArray(equipment.name, OBSOLETE));

  const usages = present.length
    ? await db
        .select({ equipmentId: equipmentUsage.equipmentId })
        .from(equipmentUsage)
        .where(
          inArray(
            equipmentUsage.equipmentId,
            present.map((p) => p.id),
          ),
        )
    : [];
  const usedIds = new Set(usages.map((u) => u.equipmentId));

  const deletable = present.filter((p) => !usedIds.has(p.id));
  const blocked = present.filter((p) => usedIds.has(p.id));

  // SET yang belum ada.
  const existingSets = await db
    .select({ name: equipment.name })
    .from(equipment)
    .where(
      inArray(
        equipment.name,
        SETS.map((s) => s.name),
      ),
    );
  const existingSetNames = new Set(existingSets.map((e) => e.name));
  const toInsert = SETS.filter((s) => !existingSetNames.has(s.name));

  console.log(`Sub-item obsolete ditemukan : ${present.length}`);
  console.log(`  - akan dihapus            : ${deletable.length}`);
  console.log(`  - dilewati (ada usage)    : ${blocked.length}`);
  console.log(`Baris SET akan dibuat       : ${toInsert.length}\n`);
  for (const d of deletable) console.log(`  - DELETE ${d.name}`);
  for (const b of blocked) console.log(`  ! SKIP (dipakai) ${b.name}`);
  for (const s of toInsert) console.log(`  + INSERT [${s.category}] ${s.name}`);

  if (!commit) {
    console.log("\nDRY-RUN — tidak ada yang ditulis. Tambahkan --commit untuk menyimpan.");
    return;
  }

  if (deletable.length) {
    await db.delete(equipment).where(
      inArray(
        equipment.id,
        deletable.map((d) => d.id),
      ),
    );
  }
  if (toInsert.length) {
    await db.insert(equipment).values(toInsert);
  }
  console.log(`\n✅ Selesai: hapus ${deletable.length}, insert ${toInsert.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
