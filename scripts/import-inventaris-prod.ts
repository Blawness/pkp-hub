/**
 * Import sekali-pakai: inventaris alat lahan PKP → tabel `equipment`.
 *
 * Sumber data mentah ("berantakan") sudah dirapikan manual ke `ITEMS` di bawah:
 *  - Dua bundel "SET" (drone & GNSS) di-flatten ke sub-item; baris parent SET
 *    dibuang (cuma kontainer, dan `jumlah`-nya inkonsisten dengan sub-item).
 *  - Prinsip "1 baris = 1 jenis": qty asli TIDAK di-expand jadi N baris, tapi
 *    dicatat di `notes` ("Jumlah: 3 (TIGA)").
 *  - `kondisi: "BAIK"` → `condition: "tersedia"`.
 *  - `tahun_perolehan` (cuma tahun) → `purchaseDate = "YYYY-01-01"`.
 *  - Kategori: instrumen inti pakai enum aslinya (drone, gps_rtk); aksesori /
 *    consumable / non-lapangan → `lainnya`, dengan konteks SET di `notes`.
 *
 * IDEMPOTENT: baris di-skip kalau `name`-nya sudah ada di DB, jadi aman
 * dijalankan ulang. NON-DESTRUKTIF: tidak pernah UPDATE / DELETE apa pun.
 *
 * DRY-RUN secara default (tidak menulis). Untuk benar-benar menulis, jalankan
 * dengan flag `--commit`.
 *
 *   # lihat dulu apa yang akan dibuat (tidak menulis):
 *   tsx --env-file=.env.prod scripts/import-inventaris-prod.ts
 *
 *   # benar-benar tulis ke DB (prod):
 *   tsx --env-file=.env.prod scripts/import-inventaris-prod.ts --commit
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment } from "@/lib/db/schema";

type Category = "total_station" | "gps_rtk" | "drone" | "waterpass" | "theodolite" | "lainnya";

type Row = {
  name: string;
  category: Category;
  purchaseDate: string; // YYYY-01-01
  notes: string;
};

const SET_DRONE = "SET DRONE DJI MATRICE 4E";
const SET_GNSS = "SET GEOMATE SG7 GNSS";

/** Susun notes: konteks SET (opsional) + jumlah asli apa adanya. */
function note(jumlah: string, set?: string): string {
  const qty = jumlah.trim() === "-" ? "Jumlah: tidak tercatat" : `Jumlah: ${jumlah.trim()}`;
  return set ? `Bagian dari ${set}. ${qty}` : qty;
}

const ITEMS: Row[] = [
  // --- Item 1: SET DRONE DJI MATRICE 4E (di-flatten) ---
  { name: "DRONE DJI MATRICE 4E", category: "drone", purchaseDate: "2025-01-01", notes: note("1 (SATU)", SET_DRONE) },
  { name: "DJI MATRICE 4E FLIGHT BATTERY", category: "lainnya", purchaseDate: "2025-01-01", notes: note("3 (TIGA)", SET_DRONE) },
  { name: "DJI MATRICE 4E BATTERY CHARGING HUB", category: "lainnya", purchaseDate: "2025-01-01", notes: note("1 (SATU)", SET_DRONE) },
  { name: "DJI RC PLUS 2 ENTERPRISE ENHANCED (REMOTE CONTROL)", category: "lainnya", purchaseDate: "2025-01-01", notes: note("1 (SATU)", SET_DRONE) },
  { name: "CARD READER 2-IN-1 CABLETIME KONEKTOR USB-A DAN USB-C", category: "lainnya", purchaseDate: "2025-01-01", notes: note("1 (SATU)", SET_DRONE) },
  { name: "PROPELLER SPARE PART", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)", SET_DRONE) },
  { name: "SD CARD SANDISK", category: "lainnya", purchaseDate: "2025-01-01", notes: note("3 (TIGA)", SET_DRONE) },

  // --- Item 2: SET GEOMATE SG7 GNSS (di-flatten) ---
  { name: "RECEIVER GEOMATE SG7 GNSS", category: "gps_rtk", purchaseDate: "2025-01-01", notes: note("2 (DUA)", SET_GNSS) },
  { name: "TRIBRACH ADAPTOR", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)", SET_GNSS) },
  { name: "EXTENSION POLE", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)", SET_GNSS) },
  { name: "ADAPTOR TRIBRACH", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)", SET_GNSS) },
  { name: "H.I TAPE - ROLL METER GEOMATE", category: "lainnya", purchaseDate: "2025-01-01", notes: note("3 (TIGA)", SET_GNSS) },
  { name: "SET ADAPTOR CABLE A TO C DAN STEKER", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA) SET", SET_GNSS) },
  { name: "RTK HEIGHT MEASURING PLATE", category: "lainnya", purchaseDate: "2025-01-01", notes: note("4 (EMPAT)", SET_GNSS) },
  { name: "CABLE CHARGER CONTROLLER", category: "lainnya", purchaseDate: "2025-01-01", notes: note("4 (EMPAT)", SET_GNSS) },
  { name: "BRACKET CONTROLLER / POLE CLAMP (KLEM TIANG)", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)", SET_GNSS) },
  { name: "GEOMATE FC2 HANDHELD CONTROLLER", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)", SET_GNSS) },
  { name: "ANTENA UHF KQT450GT", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)", SET_GNSS) },

  // --- Item 3-14: top-level ---
  { name: "MEJA LIPAT", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)") },
  { name: "SET TRIBRACH CADANGAN", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)") },
  { name: "T MARK", category: "lainnya", purchaseDate: "2025-01-01", notes: note("4 (EMPAT)") },
  { name: "POLE (GEOMATE AR RANGE)", category: "lainnya", purchaseDate: "2025-01-01", notes: note("5 (LIMA)") },
  { name: "GEOMATE TIANG SURVEY CARBON FIBER RTK", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)") },
  { name: "TRIPOD SURVEY ALUMINIUM (STATIF SURVEY)", category: "lainnya", purchaseDate: "2025-01-01", notes: note("1 (SATU)") },
  { name: "STOP KONTAK ISI 4", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)") },
  { name: "ALAT TULIS KANTOR", category: "lainnya", purchaseDate: "2025-01-01", notes: note("-") },
  { name: "LAPTOP MSI THIN 15 B12U", category: "lainnya", purchaseDate: "2025-01-01", notes: note("1 (SATU)") },
  { name: "LAPTOP MSI MODERN 14", category: "lainnya", purchaseDate: "2025-01-01", notes: note("1 (SATU)") },
  { name: "LAPTOP LENOVO LOQ", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)") },
  { name: "RAK BESI 5 SUSUN", category: "lainnya", purchaseDate: "2026-01-01", notes: note("1 (SATU)") },
  { name: "LOGITECH G304 LIGHTSPEED WIRELESS GAMING MOUSE - BLACK", category: "lainnya", purchaseDate: "2025-01-01", notes: note("1 (SATU)") },
];

async function main() {
  const commit = process.argv.includes("--commit");

  const names = ITEMS.map((i) => i.name);
  const existing = await db
    .select({ name: equipment.name })
    .from(equipment)
    .where(inArray(equipment.name, names));
  const existingNames = new Set(existing.map((e) => e.name));

  const toInsert = ITEMS.filter((i) => !existingNames.has(i.name)).map((i) => ({
    name: i.name,
    category: i.category,
    condition: "tersedia" as const,
    purchaseDate: i.purchaseDate,
    notes: i.notes,
  }));

  console.log(`Total item di sumber : ${ITEMS.length}`);
  console.log(`Sudah ada di DB      : ${existingNames.size} (di-skip)`);
  console.log(`Akan dibuat          : ${toInsert.length}`);
  console.log("");
  for (const r of toInsert) {
    console.log(`  + [${r.category}] ${r.name}`);
  }

  if (!commit) {
    console.log("\nDRY-RUN — tidak ada yang ditulis. Tambahkan --commit untuk benar-benar menyimpan.");
    return;
  }

  if (toInsert.length === 0) {
    console.log("\nTidak ada baris baru untuk ditulis.");
    return;
  }

  await db.insert(equipment).values(toInsert);
  console.log(`\n✅ Berhasil menyimpan ${toInsert.length} baris ke tabel equipment.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
