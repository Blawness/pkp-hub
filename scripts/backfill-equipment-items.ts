/**
 * Migrasi data sekali-pakai (spec 2026-07-16, tahap 2/3): tiap baris
 * `equipment` yang ada sebelum fitur quantity-per-item dijalankan tidak
 * punya `itemId`/`code`. Skrip ini membuat SATU `equipmentItem` per baris
 * (dari name/category/image lama) dan mengisi `itemId`/`code`-nya.
 *
 * `code` diisi dari `serialNumber` kalau ada & belum dipakai unit lain;
 * kalau tidak, dari 8 karakter pertama id (`UNIT-XXXXXXXX`) — placeholder
 * yang admin bisa ganti belakangan lewat form edit unit.
 *
 * AMAN: hanya menyentuh baris yang `itemId`-nya masih NULL — bisa dijalankan
 * ulang tanpa efek samping (idempotent).
 *
 *   pnpm exec tsx --env-file=.env.local scripts/backfill-equipment-items.ts
 */
import { eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment, equipmentItem } from "@/lib/db/schema";

async function main() {
  const rows = await db
    .select({
      id: equipment.id,
      name: equipment.name,
      category: equipment.category,
      image: equipment.image,
      serialNumber: equipment.serialNumber,
    })
    .from(equipment)
    .where(isNull(equipment.itemId));

  console.log(`${rows.length} unit tanpa itemId ditemukan.`);

  const usedCodes = new Set<string>();

  for (const row of rows) {
    const [item] = await db
      .insert(equipmentItem)
      .values({ name: row.name, category: row.category, image: row.image })
      .returning();

    let code = row.serialNumber?.trim() || "";
    if (!code || usedCodes.has(code)) {
      code = `UNIT-${row.id.slice(0, 8).toUpperCase()}`;
    }
    usedCodes.add(code);

    await db.update(equipment).set({ itemId: item.id, code }).where(eq(equipment.id, row.id));

    console.log(`  ${row.name} -> item ${item.id}, code "${code}"`);
  }

  console.log("Backfill selesai.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
