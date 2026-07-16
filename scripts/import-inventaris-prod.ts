/**
 * Import sekali-pakai: inventaris alat lahan PKP → tabel `equipment`.
 *
 * Sumber data mentah ("berantakan") sudah dirapikan manual ke `ITEMS` di bawah:
 *  - SET DRONE tetap 1 baris (dipinjam sepaket; isi dirinci di `notes`).
 *  - SET GEOMATE SG7 GNSS dipecah jadi 4 unit box (2 kecil + 2 besar), tiap
 *    box 1 baris dengan `serialNumber` sendiri (no. seri sementara/acak).
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

type Category =
  | "instrumen_ukur"
  | "gps_rtk"
  | "drone"
  | "aksesoris_survey"
  | "laptop"
  | "inventaris_kantor"
  | "lainnya";

type Row = {
  name: string;
  category: Category;
  purchaseDate: string; // YYYY-01-01
  notes: string;
  serialNumber?: string;
};

const SET_DRONE = "SET DRONE DJI MATRICE 4E";
const SET_GNSS = "SET GEOMATE SG7 GNSS";

/** Susun notes: konteks SET (opsional) + jumlah asli apa adanya. */
function note(jumlah: string, set?: string): string {
  const qty = jumlah.trim() === "-" ? "Jumlah: tidak tercatat" : `Jumlah: ${jumlah.trim()}`;
  return set ? `Bagian dari ${set}. ${qty}` : qty;
}

const ITEMS: Row[] = [
  // --- Item 1: SET DRONE DJI MATRICE 4E (1 baris SET, dipinjam sepaket) ---
  {
    name: SET_DRONE,
    category: "drone",
    purchaseDate: "2025-01-01",
    notes:
      "Isi 1 set: DRONE DJI MATRICE 4E (1), FLIGHT BATTERY (3), BATTERY CHARGING HUB (1), " +
      "DJI RC PLUS 2 REMOTE CONTROL (1), CARD READER 2-IN-1 CABLETIME (1), PROPELLER SPARE PART (2), " +
      "SD CARD SANDISK (3). Dipinjam sepaket.",
  },

  // --- Item 2: SET GEOMATE SG7 GNSS — dipecah jadi 4 unit box (2 kecil, 2 besar) ---
  // Tiap box = 1 unit fisik dengan no. seri sendiri. No. seri SEMENTARA (acak).
  ...["BOX KECIL 1", "BOX KECIL 2", "BOX BESAR 1", "BOX BESAR 2"].map((box, i) => ({
    name: `${SET_GNSS} - ${box}`,
    category: "gps_rtk" as const,
    purchaseDate: "2025-01-01",
    serialNumber: ["SG7-K-3KA91F", "SG7-K-7QD24B", "SG7-B-1MZ58C", "SG7-B-9XP63E"][i],
    notes:
      "Unit box dari SET GEOMATE SG7 GNSS. No. seri sementara (acak) — perbarui dengan yang asli.",
  })),

  // --- Item 3-14: top-level ---
  { name: "MEJA LIPAT", category: "lainnya", purchaseDate: "2025-01-01", notes: note("2 (DUA)") },
  {
    name: "SET TRIBRACH CADANGAN",
    category: "lainnya",
    purchaseDate: "2025-01-01",
    notes: note("2 (DUA)"),
  },
  { name: "T MARK", category: "lainnya", purchaseDate: "2025-01-01", notes: note("4 (EMPAT)") },
  {
    name: "POLE (GEOMATE AR RANGE)",
    category: "lainnya",
    purchaseDate: "2025-01-01",
    notes: note("5 (LIMA)"),
  },
  {
    name: "GEOMATE TIANG SURVEY CARBON FIBER RTK",
    category: "lainnya",
    purchaseDate: "2025-01-01",
    notes: note("2 (DUA)"),
  },
  {
    name: "TRIPOD SURVEY ALUMINIUM (STATIF SURVEY)",
    category: "lainnya",
    purchaseDate: "2025-01-01",
    notes: note("1 (SATU)"),
  },
  {
    name: "STOP KONTAK ISI 4",
    category: "lainnya",
    purchaseDate: "2025-01-01",
    notes: note("2 (DUA)"),
  },
  { name: "ALAT TULIS KANTOR", category: "lainnya", purchaseDate: "2025-01-01", notes: note("-") },
  {
    name: "LAPTOP MSI THIN 15 B12U",
    category: "lainnya",
    purchaseDate: "2025-01-01",
    notes: note("1 (SATU)"),
  },
  {
    name: "LAPTOP MSI MODERN 14",
    category: "lainnya",
    purchaseDate: "2025-01-01",
    notes: note("1 (SATU)"),
  },
  {
    name: "LAPTOP LENOVO LOQ",
    category: "lainnya",
    purchaseDate: "2025-01-01",
    notes: note("2 (DUA)"),
  },
  {
    name: "RAK BESI 5 SUSUN",
    category: "lainnya",
    purchaseDate: "2026-01-01",
    notes: note("1 (SATU)"),
  },
  {
    name: "LOGITECH G304 LIGHTSPEED WIRELESS GAMING MOUSE - BLACK",
    category: "lainnya",
    purchaseDate: "2025-01-01",
    notes: note("1 (SATU)"),
  },
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
    serialNumber: i.serialNumber ?? null,
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
    console.log(
      "\nDRY-RUN — tidak ada yang ditulis. Tambahkan --commit untuk benar-benar menyimpan.",
    );
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
