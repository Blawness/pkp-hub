# Ledger Pembayaran & Kwitansi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setiap rupiah yang masuk punya barisnya sendiri di sistem, `paymentStatus` berhenti jadi ketikan manusia dan mulai diturunkan dari uang yang benar-benar diterima, dan tiap pembayaran menerbitkan kwitansi PDF ber-nomor yang bisa diunduh owner & klien.

**Architecture:** Tabel `payment` append-only (baris hanya lahir atau dibatalkan, tidak pernah di-`UPDATE` angkanya). `projects.paymentStatus` tetap ada sebagai kolom turunan, dihitung ulang **di dalam transaksi yang sama** dengan setiap perubahan yang memicunya. Kwitansi PDF di-generate dengan `pdf-lib` dari fungsi murni, disimpan di R2 lewat `storage.put`, dan **di luar transaksi** — kegagalan generate PDF tidak boleh membatalkan pembayaran yang uangnya sudah masuk. Kwitansi TIDAK disimpan sebagai baris `documents`, karena modul Arsip terlihat oleh surveyor dan kwitansi memuat nilai proyek.

**Tech Stack:** Next.js 16 App Router, Drizzle (node-postgres), Postgres sequence, next-safe-action, react-hook-form + zod v4, pdf-lib, Vitest.

Spec: `docs/superpowers/specs/2026-07-14-ledger-pembayaran-kwitansi-design.md`

## Global Constraints

- Bahasa UI: **Indonesia**. Komentar kode boleh Indonesia — ikuti berkas di sekitarnya.
- Setiap server action WAJIB dibangun dari `authActionClient` / `adminActionClient` / `staffActionClient` di `lib/actions/safe-action.ts`. **Jangan pernah** `createSafeActionClient()` telanjang.
- Setiap fungsi di `payments-logic.ts` yang menyentuh satu proyek WAJIB lewat `assertProjectAccess` (`lib/auth-guards.ts`) — jangan pernah `db.select()` mentah pada `projects` yang cuma dijaga peran.
- **Surveyor tidak boleh melihat apa pun dari fitur ini.** Bukan disembunyikan lewat CSS atau filter UI — ditolak di server. Ini menjaga jaminan yang sudah ada: `projectValue`/`paymentStatus`/`paymentNotes` di-omit server-side dari payload surveyor (`dashboard-logic.ts`, `projects-logic.ts`).
- **Kwitansi bukan baris `documents`.** Ia hidup di kolom `payment.receiptFileUrl`.
- Uang disimpan sebagai `bigint` rupiah bulat (`mode: "number"`), sama seperti `projects.projectValue`. Tidak ada desimal, tidak ada float.
- `paidAt` adalah kolom `date` **mode string** (`YYYY-MM-DD`), bukan `Date`. Alasan: tahun pada nomor kwitansi diambil dari `paidAt`, dan `Date.getFullYear()` memakai timezone lokal — tanggal 1 Januari bisa mundur setahun di server ber-offset negatif. String tidak punya timezone, jadi tidak punya bug itu.
- Jangan pernah menyerahkan `receiptFileUrl` mentah ke browser. Selalu lewat `downloadUrlFor()` (`lib/storage/index.ts`) — bucket R2 privat.
- Test: `pnpm test` (memuat `.env.local`, memakai DB dev **sungguhan**). Lint: `pnpm lint:fix`. Typecheck: `pnpm typecheck`.
- Test yang menyentuh DB mengikuti pola `lib/actions/finance.test.ts`: `beforeAll` mengosongkan tabel & memasang fixture, `afterAll` menjalankan `execSync("pnpm db:seed")`.
- Commit tiap akhir task. Pesan commit Bahasa Indonesia, imperatif, gaya `git log` repo ini.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `lib/db/schema.ts` (modify) | Tabel `payment`, enum `payment_method`, relasi. |
| `drizzle/00xx_*.sql` (generate + hand-edit) | Migrasi + `CREATE SEQUENCE receipt_number_seq`. |
| `lib/db/seed.ts` (modify) | Baris pembayaran demo yang konsisten dengan status proyek. |
| `lib/terbilang.ts` + `.test.ts` (create) | Angka → kata Bahasa Indonesia. **Murni**, tanpa dependency. |
| `lib/format.ts` (modify) | `formatTanggalIndo("2026-07-14")` → `"14 Juli 2026"`. |
| `lib/payments/derive.ts` + `.test.ts` (create) | `derivePaymentStatus`, `buildReceiptNumber`, `receiptStorageKey`. **Murni.** |
| `lib/studio-identity.ts` (create) | Konstanta kop kwitansi. |
| `lib/receipts/template.ts` + `.test.ts` (create) | `buildReceiptPdf(data) → Uint8Array`. **Murni** (tanpa DB, tanpa storage). |
| `lib/receipts/index.ts` (create) | `generateAndStoreReceipt` — satu-satunya yang menyentuh storage. |
| `lib/storage/keys.ts` + `.test.ts` (create) | `parseStorageKey` — `documents/` vs `receipts/`. **Murni.** |
| `lib/actions/payments-schemas.ts` (create) | Skema input record/void/regenerate. |
| `lib/actions/payments-logic.ts` + `payments.test.ts` (create) | Guard + transaksi + derivasi. Inti fitur. |
| `lib/actions/payments.ts` (create) | `adminActionClient` wrappers. |
| `lib/actions/finance-schemas.ts` (modify) | Buang `paymentStatus` dari input. |
| `lib/actions/finance-logic.ts` (modify) | `updatePayment` menghitung ulang status; tolak menghapus nilai proyek yang sudah ada pembayarannya. |
| `lib/actions/finance.test.ts` (modify) | Ikut perubahan skema. |
| `lib/actions/dashboard-logic.ts` (modify) | `totalUnpaid` eksak. |
| `lib/actions/dashboard.test.ts` (modify) | Ikut perubahan itu. |
| `components/projects/payment-form.tsx` (modify) | Dropdown status dibuang. |
| `components/payments/payments-panel.tsx` (create) | Panel owner (ringkasan + tabel). |
| `components/payments/record-payment-dialog.tsx` (create) | Form catat pembayaran. |
| `components/payments/void-payment-dialog.tsx` (create) | Konfirmasi + alasan wajib. |
| `components/payments/portal-payments.tsx` (create) | Read-only untuk klien. |
| `app/dashboard/projects/[id]/page.tsx` (modify) | Render panel di tab Keuangan (admin saja). |
| `app/portal/projects/[id]/page.tsx` (modify) | Ganti kartu "Nilai & pembayaran" statis dengan riwayat. |
| `app/api/storage/[...key]/route.ts` (modify) | Prefix `receipts/`: admin & klien pemilik boleh, **surveyor ditolak**. |
| `lib/labels.ts` (modify) | `paymentMethodLabel`. |
| `package.json` | + `pdf-lib`. |
| `tasks.md` (modify) | Phase 12. |

---

### Task 1: Skema `payment` + sequence + migrasi + seed

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/00xx_*.sql` (via `pnpm db:generate`, lalu hand-edit)
- Modify: `lib/db/seed.ts`

**Interfaces:**
- Produces: tabel `payments` (Drizzle), enum `paymentMethod`, sequence Postgres `receipt_number_seq`.

- [ ] **Step 1: Tambah enum + tabel + relasi di `lib/db/schema.ts`**

Tambahkan enum tepat di bawah `paymentStatus` yang sudah ada (~baris 36):

```ts
export const paymentMethod = pgEnum("payment_method", ["transfer", "tunai", "lainnya"]);
```

Tambahkan `date` ke daftar import dari `drizzle-orm/pg-core` di atas berkas.

Tambahkan tabel setelah `documents`:

```ts
/**
 * Ledger pembayaran — APPEND-ONLY. Baris tidak pernah di-UPDATE angkanya:
 * ia hanya lahir (insert) atau dibatalkan (isi `voidedAt`/`voidedReason`).
 * Koreksi = batalkan lalu catat ulang, sehingga nomor kwitansi yang sudah
 * beredar di tangan klien tidak pernah berubah arti diam-diam.
 *
 * `paidAt` sengaja `date` mode STRING (`YYYY-MM-DD`), bukan `Date`: tahun pada
 * nomor kwitansi diambil dari sini, dan `Date.getFullYear()` memakai timezone
 * lokal — 1 Januari bisa mundur setahun di server ber-offset negatif.
 */
export const payments = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    paidAt: date("paid_at", { mode: "string" }).notNull(),
    method: paymentMethod("method").notNull(),
    note: text("note"),
    receiptNumber: text("receipt_number").notNull().unique(),
    receiptFileUrl: text("receipt_file_url"),
    recordedById: text("recorded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedReason: text("voided_reason"),
    voidedById: text("voided_by_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_project_id_idx").on(t.projectId)],
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  project: one(projects, { fields: [payments.projectId], references: [projects.id] }),
  recordedBy: one(users, { fields: [payments.recordedById], references: [users.id] }),
}));
```

Tambahkan `payments: many(payments),` ke dalam `projectsRelations`.

- [ ] **Step 2: Generate migrasi**

Run: `pnpm db:generate`
Expected: berkas baru di `drizzle/` (mis. `0003_xxx.sql`) berisi `CREATE TYPE "public"."payment_method"` dan `CREATE TABLE "payment"`.

- [ ] **Step 3: Tambahkan sequence ke SQL migrasi (hand-edit)**

`drizzle-kit` tidak tahu apa-apa tentang sequence. Buka berkas SQL yang baru dibuat dan tambahkan di **baris paling atas**:

```sql
CREATE SEQUENCE IF NOT EXISTS "receipt_number_seq" AS bigint START WITH 1 INCREMENT BY 1;
```

Sequence, bukan `SELECT max(receipt_number) + 1`: dua transaksi bersamaan bisa membaca `max()` yang sama dan menerbitkan nomor kwitansi kembar. `nextval()` tidak bisa.

- [ ] **Step 4: Jalankan migrasi**

Run: `pnpm db:migrate`
Expected: selesai tanpa error.

- [ ] **Step 5: Seed pembayaran demo**

Di `lib/db/seed.ts`: tambahkan `payments` ke import dari `@/lib/db/schema`, dan `await db.delete(payments);` sebagai **baris pertama** blok delete (sebelum `db.delete(documents)` — FK-nya menunjuk `project`).

Setelah blok `db.insert(projects)` (proyek disimpan ke variabel `projectRows`; kalau belum, tangkap hasilnya dengan `.returning()`), tambahkan — angkanya HARUS konsisten dengan `projectValue`/`paymentStatus` proyek yang sudah ada di seed:

```ts
  // Ledger pembayaran demo. Angkanya sengaja dibuat cocok dengan
  // `paymentStatus` tiap proyek — status itu sekarang TURUNAN, jadi seed yang
  // tidak konsisten akan langsung terlihat salah di UI.
  const lunasProject = projectRows.find((p) => p.paymentStatus === "lunas");
  const sebagianProject = projectRows.find((p) => p.paymentStatus === "sebagian");

  if (lunasProject) {
    await db.insert(payments).values({
      projectId: lunasProject.id,
      amount: 7_500_000, // = projectValue, jadi lunas
      paidAt: "2026-05-02",
      method: "transfer",
      note: "Pelunasan via transfer BCA.",
      receiptNumber: "KW/PKP/2026/0001",
      recordedById: adminId,
    });
  }

  if (sebagianProject) {
    await db.insert(payments).values({
      projectId: sebagianProject.id,
      amount: 21_000_000, // DP 50% dari 42.000.000
      paidAt: "2026-06-20",
      method: "transfer",
      note: "DP 50%.",
      receiptNumber: "KW/PKP/2026/0002",
      recordedById: adminId,
    });
  }
```

Kalau `adminId` belum jadi variabel di seed, ambil dari baris user admin yang sudah di-insert. Baris seed sengaja **tanpa** `receiptFileUrl` — kwitansi demo tidak perlu file; UI akan menampilkan tombol "Buat kwitansi".

- [ ] **Step 6: Jalankan seed dan pastikan hijau**

Run: `pnpm db:seed`
Expected: selesai tanpa error.

Run: `pnpm typecheck`
Expected: 0 error.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/seed.ts drizzle/
git commit -m "feat(db): tabel payment (append-only) + sequence nomor kwitansi"
```

---

### Task 2: `terbilang` — angka jadi kata

**Files:**
- Create: `lib/terbilang.ts`
- Create: `lib/terbilang.test.ts`

**Interfaces:**
- Produces:
  - `terbilang(n: number): string` — `7500000` → `"tujuh juta lima ratus ribu"`
  - `terbilangRupiah(n: number): string` — `7500000` → `"Tujuh Juta Lima Ratus Ribu Rupiah"`

- [ ] **Step 1: Tulis test yang gagal**

Buat `lib/terbilang.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { terbilang, terbilangRupiah } from "@/lib/terbilang";

/**
 * Terbilang bukan sekadar loop pembagian. Bahasa Indonesia punya bentuk
 * khusus yang SELALU jebol di implementasi naif: "sebelas" (bukan "satu
 * belas"), "seratus" (bukan "satu ratus"), "seribu" (bukan "satu ribu").
 * Tabel di bawah ada persis untuk mengunci ketiganya.
 */
describe("terbilang", () => {
  const cases: [number, string][] = [
    [0, "nol"],
    [1, "satu"],
    [11, "sebelas"],
    [15, "lima belas"],
    [20, "dua puluh"],
    [21, "dua puluh satu"],
    [100, "seratus"],
    [101, "seratus satu"],
    [200, "dua ratus"],
    [1_000, "seribu"],
    [1_500, "seribu lima ratus"],
    [2_000, "dua ribu"],
    [1_000_000, "satu juta"],
    [7_500_000, "tujuh juta lima ratus ribu"],
    [15_000_000, "lima belas juta"],
    [1_000_000_000, "satu miliar"],
  ];

  for (const [input, expected] of cases) {
    it(`${input} -> "${expected}"`, () => {
      expect(terbilang(input)).toBe(expected);
    });
  }

  it("menolak angka negatif dan pecahan — kwitansi tidak punya arti untuknya", () => {
    expect(() => terbilang(-1)).toThrow();
    expect(() => terbilang(1.5)).toThrow();
  });
});

describe("terbilangRupiah", () => {
  it("huruf kapital tiap kata + akhiran Rupiah, seperti kwitansi cetak", () => {
    expect(terbilangRupiah(7_500_000)).toBe("Tujuh Juta Lima Ratus Ribu Rupiah");
  });

  it("nol rupiah tetap terbaca", () => {
    expect(terbilangRupiah(0)).toBe("Nol Rupiah");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm test lib/terbilang.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/terbilang"`.

- [ ] **Step 3: Implementasi**

Buat `lib/terbilang.ts`:

```ts
/**
 * Angka → kata Bahasa Indonesia, untuk baris "Terbilang" di kwitansi.
 * Murni, tanpa dependency. Bentuk khusus ("sebelas"/"seratus"/"seribu")
 * ditangani lewat cabang eksplisit, bukan lewat penggabungan naif.
 */

const SATUAN = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

function toWords(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${toWords(n - 10)} belas`;
  if (n < 100) return `${toWords(Math.floor(n / 10))} puluh ${toWords(n % 10)}`;
  if (n < 200) return `seratus ${toWords(n - 100)}`;
  if (n < 1_000) return `${toWords(Math.floor(n / 100))} ratus ${toWords(n % 100)}`;
  if (n < 2_000) return `seribu ${toWords(n - 1_000)}`;
  if (n < 1_000_000) return `${toWords(Math.floor(n / 1_000))} ribu ${toWords(n % 1_000)}`;
  if (n < 1_000_000_000)
    return `${toWords(Math.floor(n / 1_000_000))} juta ${toWords(n % 1_000_000)}`;
  if (n < 1_000_000_000_000)
    return `${toWords(Math.floor(n / 1_000_000_000))} miliar ${toWords(n % 1_000_000_000)}`;
  return `${toWords(Math.floor(n / 1_000_000_000_000))} triliun ${toWords(n % 1_000_000_000_000)}`;
}

/** `7500000` -> `"tujuh juta lima ratus ribu"`. Hanya bilangan bulat >= 0. */
export function terbilang(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("terbilang: hanya menerima bilangan bulat non-negatif.");
  }
  if (n === 0) return "nol";
  return toWords(n).replace(/\s+/g, " ").trim();
}

/** `7500000` -> `"Tujuh Juta Lima Ratus Ribu Rupiah"` — bentuk yang dicetak di kwitansi. */
export function terbilangRupiah(n: number): string {
  const words = terbilang(n)
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return `${words} Rupiah`;
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm test lib/terbilang.test.ts`
Expected: PASS, semua kasus hijau.

- [ ] **Step 5: Commit**

```bash
git add lib/terbilang.ts lib/terbilang.test.ts
git commit -m "feat(kwitansi): terbilang — angka jadi kata Bahasa Indonesia"
```

---

### Task 3: Derivasi status + nomor kwitansi (murni)

**Files:**
- Create: `lib/payments/derive.ts`
- Create: `lib/payments/derive.test.ts`
- Modify: `lib/format.ts`
- Modify: `lib/labels.ts`

**Interfaces:**
- Consumes: `PaymentStatus` dari `@/lib/actions/finance-schemas` (sudah ada: `"belum" | "sebagian" | "lunas"`).
- Produces:
  - `derivePaymentStatus(totalPaid: number, projectValue: number | null): PaymentStatus`
  - `buildReceiptNumber(seq: number, paidAt: string): string` — `(7, "2026-07-14")` → `"KW/PKP/2026/0007"`
  - `receiptStorageKey(projectId: string, receiptNumber: string): string`
  - `formatTanggalIndo(iso: string): string` (di `lib/format.ts`)
  - `paymentMethodLabel: Record<string, string>` (di `lib/labels.ts`)

- [ ] **Step 1: Tulis test yang gagal**

Buat `lib/payments/derive.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatTanggalIndo } from "@/lib/format";
import { buildReceiptNumber, derivePaymentStatus, receiptStorageKey } from "@/lib/payments/derive";

describe("derivePaymentStatus", () => {
  it("belum ada uang masuk -> belum", () => {
    expect(derivePaymentStatus(0, 10_000_000)).toBe("belum");
  });

  it("sebagian masuk -> sebagian", () => {
    expect(derivePaymentStatus(4_000_000, 10_000_000)).toBe("sebagian");
  });

  it("pas -> lunas", () => {
    expect(derivePaymentStatus(10_000_000, 10_000_000)).toBe("lunas");
  });

  it("lebih bayar tetap lunas — kelebihannya urusan UI, bukan status", () => {
    expect(derivePaymentStatus(12_000_000, 10_000_000)).toBe("lunas");
  });

  it("nilai proyek belum diisi tapi ada uang masuk -> sebagian, tidak pernah lunas", () => {
    // Guard di payments-logic seharusnya mencegah keadaan ini terjadi sama
    // sekali. Kalau toh bocor, jangan pernah menyebutnya lunas: melaporkan
    // "lunas" untuk proyek yang nilainya tidak diketahui adalah kebohongan
    // yang menghapus piutang dari dashboard.
    expect(derivePaymentStatus(5_000_000, null)).toBe("sebagian");
    expect(derivePaymentStatus(5_000_000, 0)).toBe("sebagian");
  });
});

describe("buildReceiptNumber", () => {
  it("tahun dari paidAt, urut 4 digit", () => {
    expect(buildReceiptNumber(7, "2026-07-14")).toBe("KW/PKP/2026/0007");
  });

  it("tahun diambil dari STRING, bukan Date — 1 Januari tidak boleh mundur setahun", () => {
    expect(buildReceiptNumber(1, "2027-01-01")).toBe("KW/PKP/2027/0001");
  });

  it("urutan di atas 9999 tidak terpotong", () => {
    expect(buildReceiptNumber(12345, "2026-07-14")).toBe("KW/PKP/2026/12345");
  });
});

describe("receiptStorageKey", () => {
  it("garis miring nomor kwitansi jadi strip — ia tidak boleh jadi folder", () => {
    expect(receiptStorageKey("abc-123", "KW/PKP/2026/0007")).toBe(
      "receipts/abc-123/KW-PKP-2026-0007.pdf",
    );
  });
});

describe("formatTanggalIndo", () => {
  it("2026-07-14 -> 14 Juli 2026", () => {
    expect(formatTanggalIndo("2026-07-14")).toBe("14 Juli 2026");
  });

  it("tidak ada tanggal yang bergeser sehari karena timezone", () => {
    expect(formatTanggalIndo("2026-01-01")).toBe("1 Januari 2026");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm test lib/payments/derive.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/payments/derive"`.

- [ ] **Step 3: Implementasi `lib/payments/derive.ts`**

```ts
import type { PaymentStatus } from "@/lib/actions/finance-schemas";

/**
 * Fungsi murni di balik ledger pembayaran. Tidak menyentuh DB, tidak menyentuh
 * storage — sehingga aturan uangnya bisa diuji tanpa fixture apa pun.
 */

/**
 * `projects.paymentStatus` adalah kolom TURUNAN. Ini satu-satunya tempat yang
 * memutuskan nilainya; siapa pun yang menulis status tanpa lewat sini sedang
 * membuat kolom itu berbohong.
 */
export function derivePaymentStatus(
  totalPaid: number,
  projectValue: number | null,
): PaymentStatus {
  if (totalPaid <= 0) return "belum";
  if (projectValue == null || projectValue <= 0) return "sebagian";
  return totalPaid >= projectValue ? "lunas" : "sebagian";
}

/**
 * `KW/PKP/<tahun>/<urut 4 digit>`. Tahun diambil dari STRING `paidAt`
 * (`YYYY-MM-DD`), bukan dari `Date` — lihat catatan timezone di plan/spec.
 * `seq` datang dari sequence Postgres, jadi ia tidak pernah kembar.
 */
export function buildReceiptNumber(seq: number, paidAt: string): string {
  const year = paidAt.slice(0, 4);
  return `KW/PKP/${year}/${String(seq).padStart(4, "0")}`;
}

/** Kunci objek storage untuk kwitansi. Nomor kwitansi ber-"/" — datarkan jadi "-". */
export function receiptStorageKey(projectId: string, receiptNumber: string): string {
  return `receipts/${projectId}/${receiptNumber.replaceAll("/", "-")}.pdf`;
}
```

- [ ] **Step 4: Tambah `formatTanggalIndo` ke `lib/format.ts`**

Tambahkan di akhir berkas:

```ts
const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/**
 * `"2026-07-14"` -> `"14 Juli 2026"`.
 *
 * Sengaja mem-parse string, BUKAN `new Date(iso).toLocaleDateString()`:
 * `new Date("2026-07-14")` adalah tengah malam UTC, dan di server ber-offset
 * negatif ia dirender jadi 13 Juli. Tanggal pembayaran tidak boleh bergeser.
 */
export function formatTanggalIndo(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}
```

- [ ] **Step 5: Tambah `paymentMethodLabel` ke `lib/labels.ts`**

Tambahkan di bawah `paymentStatusLabel`:

```ts
export const paymentMethodLabel: Record<string, string> = {
  transfer: "Transfer",
  tunai: "Tunai",
  lainnya: "Lainnya",
};
```

- [ ] **Step 6: Jalankan test, pastikan LULUS**

Run: `pnpm test lib/payments/derive.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/payments lib/format.ts lib/labels.ts
git commit -m "feat(pembayaran): derivasi status + nomor kwitansi (fungsi murni)"
```

---

### Task 4: Template kwitansi PDF

**Files:**
- Create: `lib/studio-identity.ts`
- Create: `lib/receipts/template.ts`
- Create: `lib/receipts/template.test.ts`
- Modify: `package.json` (dependency `pdf-lib`)

**Interfaces:**
- Consumes: `terbilangRupiah` (Task 2), `formatIDR` + `formatTanggalIndo` (Task 3), `paymentMethodLabel` (Task 3).
- Produces:
  - `STUDIO` (konstanta) dari `@/lib/studio-identity`
  - `ReceiptData` (type) dan `buildReceiptPdf(data: ReceiptData): Promise<Uint8Array>` dari `@/lib/receipts/template`

- [ ] **Step 1: Pasang pdf-lib**

Run: `pnpm add pdf-lib`
Expected: `pdf-lib` masuk ke `dependencies`.

- [ ] **Step 2: Tulis test yang gagal**

Buat `lib/receipts/template.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildReceiptPdf, type ReceiptData } from "@/lib/receipts/template";

/**
 * Template kwitansi sengaja MURNI (data masuk, byte keluar) supaya bisa diuji
 * tanpa DB, tanpa storage, tanpa browser. Yang diuji bukan tata letaknya —
 * itu urusan mata — melainkan bahwa ia menghasilkan PDF yang sah dan bahwa
 * angka & nama yang benar benar-benar sampai ke dalamnya.
 */

const data: ReceiptData = {
  receiptNumber: "KW/PKP/2026/0007",
  paidAt: "2026-07-14",
  amount: 7_500_000,
  method: "transfer",
  note: "DP 50%",
  clientName: "Budi Santoso",
  projectTitle: "Pengukuran Kavling Cibubur",
  surveyTypeLabel: "Kavling",
  projectValue: 15_000_000,
  totalPaid: 7_500_000,
  remaining: 7_500_000,
  voidedReason: null,
};

describe("buildReceiptPdf", () => {
  it("menghasilkan PDF yang sah", async () => {
    const bytes = await buildReceiptPdf(data);
    expect(bytes.length).toBeGreaterThan(0);
    // Magic bytes "%PDF-" — kalau ini meleset, yang kita simpan ke R2 bukan PDF.
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("kwitansi yang dibatalkan tetap terbit, tapi membawa cap DIBATALKAN", async () => {
    const normal = await buildReceiptPdf(data);
    const voided = await buildReceiptPdf({ ...data, voidedReason: "Salah nominal" });
    // Versi batal punya isi tambahan (cap + alasan), jadi tidak mungkin identik.
    expect(voided.length).not.toBe(normal.length);
    expect(Buffer.from(voided.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("nominal nol tidak membuatnya meledak", async () => {
    const bytes = await buildReceiptPdf({ ...data, amount: 0, totalPaid: 0, remaining: 15_000_000 });
    expect(bytes.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan GAGAL**

Run: `pnpm test lib/receipts/template.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/receipts/template"`.

- [ ] **Step 4: Buat `lib/studio-identity.ts`**

```ts
/**
 * Identitas studio untuk kop kwitansi.
 *
 * Konstanta, bukan tabel `settings` + form: ini tool SATU studio (non-goal PRD
 * §1.3 — multi-tenant). Halaman pengaturan berarti tabel, action, guard, dan
 * form untuk sesuatu yang berubah sekali dalam beberapa tahun. Menggantinya =
 * satu commit, dan itu sepadan.
 *
 * TODO(manusia): ganti alamat/telepon/penanda tangan dengan data PKP yang
 * sebenarnya sebelum kwitansi pertama dikirim ke klien.
 */
export const STUDIO = {
  name: "PT PRESISI KONSULINDO PRIMA",
  address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
  phone: "021-0000-0000",
  email: "halo@pkp.co.id",
  city: "Jakarta",
  signerName: "Yudha",
  signerTitle: "Direktur",
} as const;
```

- [ ] **Step 5: Implementasi `lib/receipts/template.ts`**

```ts
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatIDR, formatTanggalIndo } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/labels";
import { STUDIO } from "@/lib/studio-identity";
import { terbilangRupiah } from "@/lib/terbilang";

/**
 * Kwitansi PDF. MURNI: data masuk, byte keluar — tidak menyentuh DB maupun
 * storage, sehingga bisa diuji tanpa fixture apa pun (`template.test.ts`).
 *
 * `pdf-lib`, bukan `@react-pdf/renderer`: ia jalan mulus di runtime Node tanpa
 * konfigurasi bundler dan mengembalikan `Uint8Array` dari fungsi biasa.
 * Harganya tata letak manual (koordinat) — untuk SATU template, itu jauh lebih
 * murah daripada menyeret reconciler React ke dalam bundel server.
 */

export type ReceiptData = {
  receiptNumber: string;
  /** `YYYY-MM-DD` */
  paidAt: string;
  amount: number;
  method: "transfer" | "tunai" | "lainnya";
  note: string | null;
  clientName: string;
  projectTitle: string;
  surveyTypeLabel: string;
  projectValue: number;
  totalPaid: number;
  remaining: number;
  /** Non-null = kwitansi ini dibatalkan; PDF-nya membawa cap DIBATALKAN. */
  voidedReason: string | null;
};

const A5_LANDSCAPE: [number, number] = [595.28, 419.53];
const MARGIN = 40;

export async function buildReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A5_LANDSCAPE);
  const [width, height] = A5_LANDSCAPE;

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.04, 0.05, 0.08);
  const muted = rgb(0.45, 0.47, 0.52);
  const danger = rgb(0.8, 0.15, 0.15);

  const text = (
    value: string,
    x: number,
    y: number,
    opts: { size?: number; font?: typeof regular; color?: typeof ink } = {},
  ) => {
    page.drawText(value, {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? regular,
      color: opts.color ?? ink,
    });
  };

  // Kop
  let y = height - MARGIN;
  text(STUDIO.name, MARGIN, y, { size: 13, font: bold });
  y -= 14;
  text(STUDIO.address, MARGIN, y, { size: 8, color: muted });
  y -= 11;
  text(`${STUDIO.phone} · ${STUDIO.email}`, MARGIN, y, { size: 8, color: muted });

  y -= 16;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 1,
    color: muted,
  });

  // Judul
  y -= 28;
  text("K W I T A N S I", width / 2 - 45, y, { size: 14, font: bold });
  y -= 14;
  text(`No. ${data.receiptNumber}`, width / 2 - 45, y, { size: 9, color: muted });

  // Badan
  const labelX = MARGIN;
  const valueX = MARGIN + 120;
  const row = (label: string, value: string, font = regular) => {
    y -= 18;
    text(label, labelX, y, { size: 9, color: muted });
    text(":", valueX - 10, y, { size: 9, color: muted });
    text(value, valueX, y, { size: 10, font });
  };

  y -= 12;
  row("Telah terima dari", data.clientName, bold);
  row("Uang sejumlah", formatIDR(data.amount), bold);
  row("Terbilang", `## ${terbilangRupiah(data.amount)} ##`);
  row("Untuk pembayaran", `${data.projectTitle} (${data.surveyTypeLabel})`);
  if (data.note) row("Keterangan", data.note);
  row("Metode", paymentMethodLabel[data.method] ?? data.method);

  // Ringkasan posisi tagihan — supaya klien tidak perlu bertanya "sisa berapa?".
  y -= 22;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 0.5,
    color: muted,
  });
  y -= 16;
  text(`Nilai proyek: ${formatIDR(data.projectValue)}`, MARGIN, y, { size: 8, color: muted });
  text(`Total dibayar: ${formatIDR(data.totalPaid)}`, MARGIN + 170, y, { size: 8, color: muted });
  text(`Sisa: ${formatIDR(data.remaining)}`, MARGIN + 350, y, { size: 8, color: muted });

  // Tanda tangan
  const signX = width - MARGIN - 160;
  let signY = MARGIN + 78;
  text(`${STUDIO.city}, ${formatTanggalIndo(data.paidAt)}`, signX, signY, { size: 9 });
  signY -= 12;
  text("Penerima,", signX, signY, { size: 9, color: muted });
  signY -= 46;
  text(STUDIO.signerName, signX, signY, { size: 10, font: bold });
  signY -= 12;
  text(STUDIO.signerTitle, signX, signY, { size: 8, color: muted });

  // Cap batal — kwitansi yang dibatalkan harus MENGATAKAN dirinya batal, bukan
  // diam-diam hilang. Salinan yang terlanjur diunduh klien tidak bisa ditarik;
  // yang bisa kita jamin adalah unduhan berikutnya jujur.
  if (data.voidedReason) {
    page.drawText("DIBATALKAN", {
      x: 90,
      y: height / 2 - 20,
      size: 56,
      font: bold,
      color: danger,
      opacity: 0.25,
      rotate: { type: "degrees", angle: 18 } as never,
    });
    text(`Alasan pembatalan: ${data.voidedReason}`, MARGIN, MARGIN + 8, {
      size: 8,
      color: danger,
    });
  }

  return pdf.save();
}
```

Catatan: kalau `rotate: { type: "degrees", ... } as never` ditolak typecheck, ganti dengan `import { degrees } from "pdf-lib"` lalu `rotate: degrees(18)`. Pakai bentuk yang lolos `pnpm typecheck` — jangan biarkan cast bohong lolos.

- [ ] **Step 6: Jalankan test, pastikan LULUS**

Run: `pnpm test lib/receipts/template.test.ts`
Expected: PASS, 3 test hijau.

Run: `pnpm typecheck`
Expected: 0 error.

- [ ] **Step 7: Commit**

```bash
git add lib/studio-identity.ts lib/receipts package.json pnpm-lock.yaml
git commit -m "feat(kwitansi): template PDF (pdf-lib) + identitas studio"
```

---

### Task 5: Simpan kwitansi ke storage

**Files:**
- Create: `lib/receipts/index.ts`
- Create: `lib/receipts/index.test.ts`

**Interfaces:**
- Consumes: `buildReceiptPdf` + `ReceiptData` (Task 4), `receiptStorageKey` (Task 3), `storage` dari `@/lib/storage` (kontrak: `put(key, body: Buffer, contentType): Promise<string>` yang mengembalikan `fileUrl`).
- Produces:
  - `ReceiptStorage` (type) — `Pick<StorageDriver, "put">`
  - `generateAndStoreReceipt(projectId: string, data: ReceiptData, store?: ReceiptStorage): Promise<string>` — mengembalikan `fileUrl`

- [ ] **Step 1: Tulis test yang gagal**

Buat `lib/receipts/index.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { generateAndStoreReceipt } from "@/lib/receipts";
import type { ReceiptData } from "@/lib/receipts/template";

const data: ReceiptData = {
  receiptNumber: "KW/PKP/2026/0007",
  paidAt: "2026-07-14",
  amount: 7_500_000,
  method: "transfer",
  note: null,
  clientName: "Budi Santoso",
  projectTitle: "Pengukuran Kavling Cibubur",
  surveyTypeLabel: "Kavling",
  projectValue: 15_000_000,
  totalPaid: 7_500_000,
  remaining: 7_500_000,
  voidedReason: null,
};

describe("generateAndStoreReceipt", () => {
  it("menulis PDF ke kunci kwitansi — BUKAN ke prefix documents/", async () => {
    const put = vi.fn(async () => "/api/storage/receipts/p1/KW-PKP-2026-0007.pdf");

    const fileUrl = await generateAndStoreReceipt("p1", data, { put });

    expect(put).toHaveBeenCalledTimes(1);
    const [key, body, contentType] = put.mock.calls[0] as unknown as [string, Buffer, string];
    // Prefix-nya load-bearing: rute storage lokal memakainya untuk MENOLAK
    // surveyor. Kwitansi yang tersimpan di bawah `documents/` akan lolos guard
    // dokumen dan membocorkan nilai proyek.
    expect(key).toBe("receipts/p1/KW-PKP-2026-0007.pdf");
    expect(contentType).toBe("application/pdf");
    expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(fileUrl).toBe("/api/storage/receipts/p1/KW-PKP-2026-0007.pdf");
  });

  it("melempar kalau storage gagal — pemanggil yang memutuskan apa artinya", async () => {
    const put = vi.fn(async () => {
      throw new Error("R2 down");
    });
    await expect(generateAndStoreReceipt("p1", data, { put })).rejects.toThrow("R2 down");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm test lib/receipts/index.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/receipts"`.

- [ ] **Step 3: Implementasi `lib/receipts/index.ts`**

```ts
import { receiptStorageKey } from "@/lib/payments/derive";
import { buildReceiptPdf, type ReceiptData } from "@/lib/receipts/template";
import { storage } from "@/lib/storage";
import type { StorageDriver } from "@/lib/storage/types";

/**
 * Satu-satunya tempat kwitansi menyentuh storage.
 *
 * `store` bisa disuntik supaya test bisa memakai driver palsu — termasuk yang
 * SENGAJA melempar, karena "pembayaran tetap tercatat walau kwitansi gagal
 * dibuat" adalah invarian yang harus diuji, bukan diharapkan.
 */
export type ReceiptStorage = Pick<StorageDriver, "put">;

/**
 * Render kwitansi dan simpan di bawah prefix `receipts/`. Mengembalikan
 * `fileUrl` yang disimpan ke `payment.receiptFileUrl`.
 *
 * Melempar kalau render/upload gagal. Ia TIDAK menelan errornya sendiri:
 * yang tahu apa arti kegagalan ini adalah pemanggilnya (`payments-logic.ts`),
 * dan di sana keputusannya jelas — uang yang sudah masuk tetap tercatat.
 */
export async function generateAndStoreReceipt(
  projectId: string,
  data: ReceiptData,
  store: ReceiptStorage = storage,
): Promise<string> {
  const key = receiptStorageKey(projectId, data.receiptNumber);
  const bytes = await buildReceiptPdf(data);
  return store.put(key, Buffer.from(bytes), "application/pdf");
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm test lib/receipts/index.test.ts`
Expected: PASS, 2 test hijau.

- [ ] **Step 5: Commit**

```bash
git add lib/receipts
git commit -m "feat(kwitansi): simpan PDF ke storage di bawah prefix receipts/"
```

---

### Task 6: Guard rute storage lokal untuk `receipts/`

**Files:**
- Create: `lib/storage/keys.ts`
- Create: `lib/storage/keys.test.ts`
- Modify: `app/api/storage/[...key]/route.ts`

**Interfaces:**
- Produces: `parseStorageKey(key: string): { kind: "document" | "receipt"; projectId: string } | null`

Kenapa task ini ada: driver lokal menyajikan byte lewat `GET /api/storage/<key>`, dan rute itu sekarang **hanya** mengenali prefix `documents/`. Kwitansi di bawah `receipts/` akan jatuh ke cabang "kunci tidak sah" (aman, tapi kwitansi tidak bisa diunduh di dev) — dan begitu seseorang "memperbaikinya" dengan melonggarkan `projectIdFromKey`, surveyor yang di-assign ke proyek itu langsung bisa membuka kwitansinya, karena `assertProjectAccess` **meloloskan** surveyor yang di-assign. Jadi aturan penolakan surveyor harus ditulis eksplisit di rute ini.

- [ ] **Step 1: Tulis test yang gagal**

Buat `lib/storage/keys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStorageKey } from "@/lib/storage/keys";

describe("parseStorageKey", () => {
  it("mengenali kunci dokumen", () => {
    expect(parseStorageKey("documents/abc/laporan.pdf")).toEqual({
      kind: "document",
      projectId: "abc",
    });
  });

  it("mengenali kunci kwitansi", () => {
    expect(parseStorageKey("receipts/abc/KW-PKP-2026-0001.pdf")).toEqual({
      kind: "receipt",
      projectId: "abc",
    });
  });

  it("menolak prefix yang tidak dikenal — termasuk yang mencoba menyamar", () => {
    expect(parseStorageKey("secrets/abc/x.pdf")).toBeNull();
    expect(parseStorageKey("documents")).toBeNull();
    expect(parseStorageKey("receipts/")).toBeNull();
    expect(parseStorageKey("")).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm test lib/storage/keys.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/storage/keys"`.

- [ ] **Step 3: Implementasi `lib/storage/keys.ts`**

```ts
/**
 * Kunci objek storage punya DUA prefix, dan keduanya punya aturan akses yang
 * berbeda — itulah kenapa parsingnya berdiri sendiri dan diuji sendiri:
 *
 * - `documents/<projectId>/...` — staf (admin + surveyor yang di-assign) dan,
 *   kalau `sharedWithClient`, klien pemiliknya.
 * - `receipts/<projectId>/...`  — admin dan klien pemiliknya. SURVEYOR TIDAK,
 *   meski proyeknya di-assign ke dia: kwitansi memuat nilai proyek, dan
 *   surveyor tidak boleh melihat keuangan.
 */
export type StorageKeyKind = "document" | "receipt";

export type ParsedStorageKey = {
  kind: StorageKeyKind;
  projectId: string;
};

const PREFIX_TO_KIND: Record<string, StorageKeyKind> = {
  documents: "document",
  receipts: "receipt",
};

export function parseStorageKey(key: string): ParsedStorageKey | null {
  const [prefix, projectId] = key.split("/");
  const kind = PREFIX_TO_KIND[prefix];
  if (!kind || !projectId) return null;
  return { kind, projectId };
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm test lib/storage/keys.test.ts`
Expected: PASS.

- [ ] **Step 5: Pakai di rute storage**

Di `app/api/storage/[...key]/route.ts`:

Ganti import `documents` dengan menambahkan `payments`, dan tambahkan `parseStorageKey`:

```ts
import { parseStorageKey } from "@/lib/storage/keys";
```

Hapus fungsi `projectIdFromKey` (digantikan `parseStorageKey`).

Di `GET`, ganti blok penurunan `projectId` + guard klien dengan:

```ts
  const user = await requireUser();
  const parsed = parseStorageKey(key);
  if (!parsed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Kwitansi memuat nilai proyek. Surveyor TIDAK boleh melihat keuangan —
  // dan `assertProjectAccess` di bawah MELOLOSKAN surveyor yang di-assign,
  // jadi penolakan ini harus berdiri sendiri, sebelum guard itu.
  if (parsed.kind === "receipt" && user.role === "surveyor") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    await assertProjectAccess(parsed.projectId, user);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (parsed.kind === "document" && user.role === "client") {
    const [doc] = await db
      .select({ sharedWithClient: documents.sharedWithClient })
      .from(documents)
      .where(eq(documents.fileUrl, `/api/storage/${key}`));
    if (!doc?.sharedWithClient) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  if (parsed.kind === "receipt") {
    // Klien boleh mengunduh kwitansi proyeknya sendiri — `assertProjectAccess`
    // sudah memastikan proyek ini miliknya — TAPI bukan kwitansi yang sudah
    // dibatalkan: baris batal bukan bagian dari catatan uangnya.
    const [row] = await db
      .select({ voidedAt: payments.voidedAt })
      .from(payments)
      .where(eq(payments.receiptFileUrl, `/api/storage/${key}`));
    if (!row) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (user.role === "client" && row.voidedAt !== null) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }
```

Di `PUT`, ganti penurunan `projectId`:

```ts
  const user = await requireStaff();
  const parsed = parseStorageKey(key);
  // Kwitansi TIDAK PERNAH diunggah lewat HTTP — ia ditulis server-side lewat
  // `storage.put`. Menerima PUT ke `receipts/` berarti membiarkan siapa pun
  // yang berstatus staf menimpa kwitansi dengan berkas karangannya sendiri.
  if (!parsed || parsed.kind !== "document") {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  try {
    await assertProjectAccess(parsed.projectId, user);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
```

Perbarui juga komentar blok di kepala berkas supaya menyebut kedua prefix dan aturan surveyor.

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 error.

- [ ] **Step 7: Commit**

```bash
git add lib/storage/keys.ts lib/storage/keys.test.ts "app/api/storage/[...key]/route.ts"
git commit -m "feat(storage): prefix receipts/ — surveyor ditolak, kwitansi batal disembunyikan dari klien"
```

---

### Task 7: `payments-logic` — guard, transaksi, derivasi

Inti fitur. Task terbesar; jangan dipecah — guard, transaksi, dan derivasi hanya bermakna kalau diuji bersama.

**Files:**
- Create: `lib/actions/payments-schemas.ts`
- Create: `lib/actions/payments-logic.ts`
- Create: `lib/actions/payments.test.ts`

**Interfaces:**
- Consumes: `derivePaymentStatus` + `buildReceiptNumber` (Task 3), `generateAndStoreReceipt` + `ReceiptStorage` (Task 5), `assertProjectAccess` / `SessionUser` (`@/lib/auth-guards`), `payments` / `projects` / `clients` (`@/lib/db/schema`), `surveyTypeLabel` (`@/lib/labels`).
- Produces:
  - `recordPaymentInputSchema`, `voidPaymentInputSchema`, `regenerateReceiptInputSchema`, `paymentMethodSchema` + tipe `RecordPaymentInput`, `VoidPaymentInput`, `RegenerateReceiptInput`
  - `PaymentRow`, `PaymentSummary` (types)
  - `listPaymentsForProject(user, projectId): Promise<PaymentRow[]>`
  - `getPaymentSummary(user, projectId): Promise<PaymentSummary>`
  - `recordPaymentForUser(user, input, store?): Promise<PaymentRow>`
  - `voidPaymentForUser(user, input, store?): Promise<PaymentRow>`
  - `regenerateReceiptForUser(user, input, store?): Promise<PaymentRow>`
  - `recomputePaymentStatus(tx, projectId): Promise<PaymentStatus>` (dipakai ulang oleh `finance-logic.ts` di Task 8)
  - `type DbOrTx`

- [ ] **Step 1: Buat `lib/actions/payments-schemas.ts`**

```ts
import { z } from "zod";

/**
 * Skema input ledger pembayaran. Sengaja dipisah dari `payments-logic.ts`
 * (yang server-only) mengikuti pola `finance-schemas.ts` — komponen klien
 * boleh mengimpor skema, tidak boleh mengimpor logika.
 */

export const paymentMethodSchema = z.enum(["transfer", "tunai", "lainnya"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const recordPaymentInputSchema = z.object({
  projectId: z.uuid(),
  // Rupiah bulat, harus positif. Pembayaran nol bukan pembayaran, dan
  // pembayaran negatif adalah refund — fitur lain, dengan aturan lain.
  amount: z.number().int().positive("Jumlah pembayaran harus lebih dari 0."),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus dalam format YYYY-MM-DD."),
  method: paymentMethodSchema,
  note: z.string().trim().max(500).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentInputSchema>;

export const voidPaymentInputSchema = z.object({
  paymentId: z.uuid(),
  // Alasan WAJIB. Baris ledger yang dibatalkan tanpa alasan adalah lubang di
  // catatan uang — enam bulan lagi tidak ada yang tahu kenapa ia hilang.
  reason: z.string().trim().min(3, "Tulis alasan pembatalan.").max(500),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentInputSchema>;

export const regenerateReceiptInputSchema = z.object({ paymentId: z.uuid() });
export type RegenerateReceiptInput = z.infer<typeof regenerateReceiptInputSchema>;
```

- [ ] **Step 2: Tulis test yang gagal**

Buat `lib/actions/payments.test.ts`:

```ts
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getPaymentSummary,
  listPaymentsForProject,
  recordPaymentForUser,
  voidPaymentForUser,
} from "@/lib/actions/payments-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import {
  clients,
  documents,
  mapLayers,
  payments,
  projectStatusLogs,
  projects,
  users,
} from "@/lib/db/schema";
import type { ReceiptStorage } from "@/lib/receipts";

/**
 * Berjalan terhadap DB dev sungguhan, pola yang sama dengan `finance.test.ts`.
 *
 * Dua kelompok test di sini, dan keduanya load-bearing:
 *
 * 1. BATAS AKSES. Surveyor tidak boleh menyentuh apa pun dari ledger — bahkan
 *    untuk proyek yang di-assign KE DIA. Ini bukan formalitas: kwitansi memuat
 *    nilai proyek, dan jaminan "surveyor tidak lihat keuangan" (yang sudah
 *    dikunci `dashboard.test.ts`) runtuh kalau ledger bocor. Test-test itu
 *    HARUS jeblok kalau `requireAdmin` di `payments-logic.ts` dicabut.
 *
 * 2. INVARIAN UANG. Status turunan cocok dengan uang yang masuk; pembatalan
 *    memundurkan status; dan — yang paling gampang salah — PEMBAYARAN TETAP
 *    TERCATAT walau kwitansi gagal dibuat.
 */

// Storage palsu yang selalu berhasil.
const okStore: ReceiptStorage = {
  put: async (key) => `/api/storage/${key}`,
};

// Storage palsu yang SELALU gagal — meniru R2 down.
const brokenStore: ReceiptStorage = {
  put: async () => {
    throw new Error("R2 down");
  },
};

let admin: SessionUser;
let surveyor: SessionUser;
let clientUser: SessionUser;
let otherClientUser: SessionUser;
let projectId: string;
let otherProjectId: string;

beforeAll(async () => {
  await db.delete(payments);
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorId = randomUUID();
  const clientUserId = randomUUID();
  const otherClientUserId = randomUUID();

  await db.insert(users).values([
    { id: adminId, name: "Pay Admin", email: "pay-admin@fixture.test", role: "admin" },
    { id: surveyorId, name: "Pay Surveyor", email: "pay-surveyor@fixture.test", role: "surveyor" },
    { id: clientUserId, name: "Pay Client", email: "pay-client@fixture.test", role: "client" },
    {
      id: otherClientUserId,
      name: "Pay Other",
      email: "pay-other@fixture.test",
      role: "client",
    },
  ]);

  admin = { id: adminId, name: "Pay Admin", email: "pay-admin@fixture.test", role: "admin" };
  surveyor = {
    id: surveyorId,
    name: "Pay Surveyor",
    email: "pay-surveyor@fixture.test",
    role: "surveyor",
  };
  clientUser = {
    id: clientUserId,
    name: "Pay Client",
    email: "pay-client@fixture.test",
    role: "client",
  };
  otherClientUser = {
    id: otherClientUserId,
    name: "Pay Other",
    email: "pay-other@fixture.test",
    role: "client",
  };

  const [clientA] = await db
    .insert(clients)
    .values([{ name: "Klien A", type: "individual", userId: clientUserId }])
    .returning();
  const [clientB] = await db
    .insert(clients)
    .values([{ name: "Klien B", type: "individual", userId: otherClientUserId }])
    .returning();

  const [projectA] = await db
    .insert(projects)
    .values({
      title: "Proyek Klien A",
      clientId: clientA.id,
      surveyType: "kavling",
      assignedSurveyorId: surveyorId, // di-assign KE surveyor — inti test guard
      status: "baru",
      projectValue: 10_000_000,
      paymentStatus: "belum",
    })
    .returning();
  projectId = projectA.id;

  const [projectB] = await db
    .insert(projects)
    .values({
      title: "Proyek Klien B",
      clientId: clientB.id,
      surveyType: "kavling",
      status: "baru",
      projectValue: 5_000_000,
      paymentStatus: "belum",
    })
    .returning();
  otherProjectId = projectB.id;
});

afterAll(() => {
  execSync("pnpm db:seed", { stdio: "inherit" });
});

describe("batas akses ledger", () => {
  it("surveyor TIDAK bisa melihat pembayaran proyek yang di-assign ke dia", async () => {
    await expect(listPaymentsForProject(surveyor, projectId)).rejects.toThrow();
  });

  it("surveyor TIDAK bisa mencatat pembayaran", async () => {
    await expect(
      recordPaymentForUser(
        surveyor,
        { projectId, amount: 1_000_000, paidAt: "2026-07-14", method: "transfer" },
        okStore,
      ),
    ).rejects.toThrow();

    const rows = await db.select().from(payments).where(eq(payments.projectId, projectId));
    expect(rows).toHaveLength(0);
  });

  it("klien TIDAK bisa mencatat pembayaran untuk proyeknya sendiri", async () => {
    await expect(
      recordPaymentForUser(
        clientUser,
        { projectId, amount: 1_000_000, paidAt: "2026-07-14", method: "transfer" },
        okStore,
      ),
    ).rejects.toThrow();
  });

  it("klien TIDAK bisa melihat pembayaran proyek klien lain", async () => {
    await expect(listPaymentsForProject(otherClientUser, projectId)).rejects.toThrow();
  });
});

describe("recordPaymentForUser", () => {
  it("menolak pembayaran kalau nilai proyek belum diisi", async () => {
    const [noValue] = await db
      .insert(projects)
      .values({
        title: "Tanpa nilai",
        clientId: (await db.select().from(clients).limit(1))[0].id,
        surveyType: "kavling",
        status: "baru",
        projectValue: null,
        paymentStatus: "belum",
      })
      .returning();

    await expect(
      recordPaymentForUser(
        admin,
        { projectId: noValue.id, amount: 1_000, paidAt: "2026-07-14", method: "tunai" },
        okStore,
      ),
    ).rejects.toThrow();
  });

  it("mencatat pembayaran, menerbitkan nomor kwitansi, dan menurunkan status jadi sebagian", async () => {
    const payment = await recordPaymentForUser(
      admin,
      { projectId, amount: 4_000_000, paidAt: "2026-07-14", method: "transfer", note: "DP" },
      okStore,
    );

    expect(payment.amount).toBe(4_000_000);
    expect(payment.receiptNumber).toMatch(/^KW\/PKP\/2026\/\d{4,}$/);
    expect(payment.receiptFileUrl).toContain("receipts/");

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(project.paymentStatus).toBe("sebagian");

    const summary = await getPaymentSummary(admin, projectId);
    expect(summary.totalPaid).toBe(4_000_000);
    expect(summary.remaining).toBe(6_000_000);
  });

  it("pelunasan membuat status jadi lunas", async () => {
    await recordPaymentForUser(
      admin,
      { projectId, amount: 6_000_000, paidAt: "2026-07-20", method: "transfer" },
      okStore,
    );

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(project.paymentStatus).toBe("lunas");

    const summary = await getPaymentSummary(admin, projectId);
    expect(summary.totalPaid).toBe(10_000_000);
    expect(summary.remaining).toBe(0);
  });

  it("dua pembayaran beruntun tidak pernah bernomor kwitansi sama", async () => {
    const a = await recordPaymentForUser(
      admin,
      { projectId: otherProjectId, amount: 1_000, paidAt: "2026-07-14", method: "tunai" },
      okStore,
    );
    const b = await recordPaymentForUser(
      admin,
      { projectId: otherProjectId, amount: 1_000, paidAt: "2026-07-14", method: "tunai" },
      okStore,
    );
    expect(a.receiptNumber).not.toBe(b.receiptNumber);
  });

  it("PEMBAYARAN TETAP TERCATAT walau kwitansi gagal dibuat", async () => {
    // Uang yang sudah masuk adalah fakta; PDF cuma cerminannya. Kalau R2 down
    // membuat studio tidak bisa mencatat uang masuk, kita sudah kalah. Test ini
    // HARUS jeblok kalau try/catch di sekitar generateAndStoreReceipt dicabut.
    const payment = await recordPaymentForUser(
      admin,
      { projectId: otherProjectId, amount: 2_000, paidAt: "2026-07-14", method: "tunai" },
      brokenStore,
    );

    expect(payment.receiptFileUrl).toBeNull();
    expect(payment.receiptNumber).toBeTruthy();

    const [row] = await db.select().from(payments).where(eq(payments.id, payment.id));
    expect(row).toBeTruthy();
    expect(row.amount).toBe(2_000);
  });
});

describe("voidPaymentForUser", () => {
  it("pembatalan mengeluarkan baris dari total dan memundurkan status", async () => {
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.projectId, projectId))
      .limit(1);

    await voidPaymentForUser(admin, { paymentId: row.id, reason: "Salah nominal" }, okStore);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    // Sebelumnya lunas (10jt dari dua pembayaran). Satu dibatalkan -> mundur.
    expect(project.paymentStatus).toBe("sebagian");

    const summary = await getPaymentSummary(admin, projectId);
    expect(summary.totalPaid).toBeLessThan(10_000_000);
  });

  it("surveyor TIDAK bisa membatalkan pembayaran", async () => {
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.projectId, projectId))
      .limit(1);

    await expect(
      voidPaymentForUser(surveyor, { paymentId: row.id, reason: "coba-coba" }, okStore),
    ).rejects.toThrow();
  });

  it("klien tidak pernah melihat baris yang dibatalkan", async () => {
    const rows = await listPaymentsForProject(clientUser, projectId);
    expect(rows.every((r) => r.voidedAt === null)).toBe(true);
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan GAGAL**

Run: `pnpm test lib/actions/payments.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/actions/payments-logic"`.

- [ ] **Step 4: Implementasi `lib/actions/payments-logic.ts`**

```ts
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PaymentStatus } from "@/lib/actions/finance-schemas";
import type {
  RecordPaymentInput,
  RegenerateReceiptInput,
  VoidPaymentInput,
} from "@/lib/actions/payments-schemas";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import type * as schema from "@/lib/db/schema";
import { clients, payments, projects } from "@/lib/db/schema";
import { surveyTypeLabel } from "@/lib/labels";
import { buildReceiptNumber, derivePaymentStatus } from "@/lib/payments/derive";
import { generateAndStoreReceipt, type ReceiptStorage } from "@/lib/receipts";
import type { ReceiptData } from "@/lib/receipts/template";
import { storage } from "@/lib/storage";

/**
 * Ledger pembayaran (spec 2026-07-14). Logika + guard dipisah dari pembungkus
 * "use server" di `payments.ts` supaya bisa diuji langsung (`payments.test.ts`),
 * pola yang sama dengan `finance-logic.ts`.
 *
 * CRITICAL — SURVEYOR TIDAK BOLEH MENYENTUH APA PUN DI SINI, termasuk untuk
 * proyek yang di-assign ke dia. Kwitansi memuat nilai proyek, jadi kebocoran
 * di modul ini meruntuhkan jaminan "surveyor tidak lihat keuangan" yang sudah
 * ditegakkan (dan diuji) di `dashboard-logic.ts` / `projects-logic.ts`.
 * Perhatikan: `assertProjectAccess` MELOLOSKAN surveyor yang di-assign — jadi
 * ia BUKAN guard yang cukup di sini. `requireAdmin` harus mendahuluinya.
 */

export type DbOrTx =
  | typeof db
  | PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type PaymentRow = {
  id: string;
  projectId: string;
  amount: number;
  paidAt: string;
  method: "transfer" | "tunai" | "lainnya";
  note: string | null;
  receiptNumber: string;
  receiptFileUrl: string | null;
  recordedById: string;
  voidedAt: Date | null;
  voidedReason: string | null;
  createdAt: Date;
};

export type PaymentSummary = {
  projectValue: number | null;
  totalPaid: number;
  remaining: number;
  status: PaymentStatus;
};

function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    throw new Error("Only the admin can manage payments.");
  }
}

/** Sama seperti `finance-logic.ts`: ubah sinyal 404 `notFound()` jadi penolakan biasa. */
function isNotFoundDigest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

async function assertProjectAccessOrReject(projectId: string, user: SessionUser) {
  try {
    return await assertProjectAccess(projectId, user);
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Project not found or you do not have access to it.");
    }
    throw error;
  }
}

/** Total uang masuk (baris batal TIDAK dihitung). */
async function totalPaidFor(handle: DbOrTx, projectId: string): Promise<number> {
  const [row] = await handle
    .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
    .from(payments)
    .where(and(eq(payments.projectId, projectId), isNull(payments.voidedAt)));
  return row?.total ?? 0;
}

/**
 * Hitung ulang `projects.paymentStatus` dari ledger dan tulis balik.
 *
 * WAJIB dipanggil di dalam transaksi yang sama dengan perubahan yang memicunya
 * (insert pembayaran, pembatalan, atau perubahan `projectValue`). Di luar
 * transaksi, dua perubahan bersamaan bisa saling menimpa dan meninggalkan
 * kolom status yang tidak cocok dengan uangnya.
 */
export async function recomputePaymentStatus(
  handle: DbOrTx,
  projectId: string,
): Promise<PaymentStatus> {
  const [project] = await handle
    .select({ projectValue: projects.projectValue })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) throw new Error("Project not found.");

  const totalPaid = await totalPaidFor(handle, projectId);
  const status = derivePaymentStatus(totalPaid, project.projectValue);

  await handle
    .update(projects)
    .set({ paymentStatus: status, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  return status;
}

/** Nomor urut kwitansi berikutnya. Sequence Postgres — tidak bisa kembar. */
async function nextReceiptSeq(handle: DbOrTx): Promise<number> {
  const result = await handle.execute(sql`SELECT nextval('receipt_number_seq') AS seq`);
  const rows = (result as unknown as { rows: { seq: string | number }[] }).rows;
  return Number(rows[0].seq);
}

/** Admin: semua baris. Klien: hanya proyeknya sendiri, dan hanya baris yang TIDAK dibatalkan. */
export async function listPaymentsForProject(
  user: SessionUser,
  projectId: string,
): Promise<PaymentRow[]> {
  if (user.role === "surveyor") {
    throw new Error("Surveyors cannot view payments.");
  }
  await assertProjectAccessOrReject(projectId, user);

  const where =
    user.role === "client"
      ? and(eq(payments.projectId, projectId), isNull(payments.voidedAt))
      : eq(payments.projectId, projectId);

  return db.select().from(payments).where(where).orderBy(desc(payments.paidAt));
}

export async function getPaymentSummary(
  user: SessionUser,
  projectId: string,
): Promise<PaymentSummary> {
  if (user.role === "surveyor") {
    throw new Error("Surveyors cannot view payments.");
  }
  const project = await assertProjectAccessOrReject(projectId, user);

  const totalPaid = await totalPaidFor(db, projectId);
  const projectValue = project.projectValue ?? null;
  return {
    projectValue,
    totalPaid,
    remaining: Math.max(0, (projectValue ?? 0) - totalPaid),
    status: derivePaymentStatus(totalPaid, projectValue),
  };
}

/** Rakit data kwitansi. Dipakai saat mencatat, membatalkan, dan membuat ulang. */
async function receiptDataFor(payment: PaymentRow): Promise<ReceiptData> {
  const [project] = await db.select().from(projects).where(eq(projects.id, payment.projectId));
  const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
  const totalPaid = await totalPaidFor(db, payment.projectId);
  const projectValue = project.projectValue ?? 0;

  return {
    receiptNumber: payment.receiptNumber,
    paidAt: payment.paidAt,
    amount: payment.amount,
    method: payment.method,
    note: payment.note,
    clientName: client?.name ?? "—",
    projectTitle: project.title,
    surveyTypeLabel: surveyTypeLabel[project.surveyType] ?? project.surveyType,
    projectValue,
    totalPaid,
    remaining: Math.max(0, projectValue - totalPaid),
    voidedReason: payment.voidedReason,
  };
}

/**
 * Terbitkan kwitansi dan simpan URL-nya — TANPA pernah melempar.
 *
 * Dipanggil DI LUAR transaksi, dan errornya sengaja ditelan + di-log. Alasannya
 * sama persis dengan notifikasi email Phase 11: kalau kwitansi dibuat di dalam
 * transaksi, R2 yang down membuat studio tidak bisa mencatat uang yang sudah
 * masuk sama sekali. Pekerjaan sampingan tidak boleh mengalahkan pekerjaan
 * sungguhan. Baris tetap ada, `receiptFileUrl` null, UI menawarkan "Buat ulang".
 */
async function issueReceiptQuietly(
  payment: PaymentRow,
  store: ReceiptStorage,
): Promise<string | null> {
  try {
    const data = await receiptDataFor(payment);
    const fileUrl = await generateAndStoreReceipt(payment.projectId, data, store);
    await db.update(payments).set({ receiptFileUrl: fileUrl }).where(eq(payments.id, payment.id));
    return fileUrl;
  } catch (error) {
    console.error(`[kwitansi] gagal membuat kwitansi ${payment.receiptNumber}:`, error);
    return null;
  }
}

/** Admin-only. Catat satu pembayaran; status proyek ikut dihitung ulang. */
export async function recordPaymentForUser(
  user: SessionUser,
  input: RecordPaymentInput,
  store: ReceiptStorage = storage,
): Promise<PaymentRow> {
  requireAdmin(user);
  const project = await assertProjectAccessOrReject(input.projectId, user);

  if (project.projectValue == null || project.projectValue <= 0) {
    throw new Error("Isi nilai proyek dulu sebelum mencatat pembayaran.");
  }

  const payment = await db.transaction(async (tx) => {
    const seq = await nextReceiptSeq(tx);
    const [row] = await tx
      .insert(payments)
      .values({
        projectId: input.projectId,
        amount: input.amount,
        paidAt: input.paidAt,
        method: input.method,
        note: input.note && input.note.length > 0 ? input.note : null,
        receiptNumber: buildReceiptNumber(seq, input.paidAt),
        recordedById: user.id,
      })
      .returning();
    await recomputePaymentStatus(tx, input.projectId);
    return row;
  });

  const fileUrl = await issueReceiptQuietly(payment, store);
  return { ...payment, receiptFileUrl: fileUrl };
}

/**
 * Admin-only. Batalkan satu pembayaran. Barisnya TIDAK dihapus — ledger
 * append-only — dan kwitansinya diterbitkan ulang membawa cap DIBATALKAN di
 * kunci yang sama, sehingga unduhan berikutnya jujur.
 */
export async function voidPaymentForUser(
  user: SessionUser,
  input: VoidPaymentInput,
  store: ReceiptStorage = storage,
): Promise<PaymentRow> {
  requireAdmin(user);

  const [existing] = await db.select().from(payments).where(eq(payments.id, input.paymentId));
  if (!existing) throw new Error("Payment not found.");
  await assertProjectAccessOrReject(existing.projectId, user);
  if (existing.voidedAt) throw new Error("Pembayaran ini sudah dibatalkan.");

  const payment = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(payments)
      .set({ voidedAt: new Date(), voidedReason: input.reason, voidedById: user.id })
      .where(eq(payments.id, input.paymentId))
      .returning();
    await recomputePaymentStatus(tx, row.projectId);
    return row;
  });

  await issueReceiptQuietly(payment, store);
  return payment;
}

/** Admin-only. Buat ulang kwitansi yang sebelumnya gagal terbit (`receiptFileUrl` null). */
export async function regenerateReceiptForUser(
  user: SessionUser,
  input: RegenerateReceiptInput,
  store: ReceiptStorage = storage,
): Promise<PaymentRow> {
  requireAdmin(user);

  const [existing] = await db.select().from(payments).where(eq(payments.id, input.paymentId));
  if (!existing) throw new Error("Payment not found.");
  await assertProjectAccessOrReject(existing.projectId, user);

  const fileUrl = await issueReceiptQuietly(existing, store);
  if (!fileUrl) throw new Error("Kwitansi gagal dibuat. Coba lagi.");
  return { ...existing, receiptFileUrl: fileUrl };
}
```

- [ ] **Step 5: Jalankan test, pastikan LULUS**

Run: `pnpm test lib/actions/payments.test.ts`
Expected: PASS, semua test hijau.

- [ ] **Step 6: Buktikan guard-nya benar-benar menahan sesuatu**

Cabut sementara isi `requireAdmin` (jadikan badan fungsinya kosong), jalankan lagi:

Run: `pnpm test lib/actions/payments.test.ts`
Expected: **FAIL** — test "surveyor TIDAK bisa mencatat pembayaran" dan "surveyor TIDAK bisa membatalkan pembayaran" merah.

Kembalikan `requireAdmin` seperti semula, jalankan lagi, pastikan hijau. Test yang tidak pernah merah tidak menjaga apa pun.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/payments-schemas.ts lib/actions/payments-logic.ts lib/actions/payments.test.ts
git commit -m "feat(pembayaran): ledger append-only + status turunan + kwitansi (admin-only)"
```

---

### Task 8: Server actions + `updatePayment` menyusut

**Files:**
- Create: `lib/actions/payments.ts`
- Modify: `lib/actions/finance-schemas.ts`
- Modify: `lib/actions/finance-logic.ts`
- Modify: `lib/actions/finance.test.ts`
- Modify: `components/projects/payment-form.tsx`

**Interfaces:**
- Consumes: `recordPaymentForUser` / `voidPaymentForUser` / `regenerateReceiptForUser` / `recomputePaymentStatus` (Task 7), `adminActionClient`.
- Produces: server actions `recordPayment`, `voidPayment`, `regenerateReceipt`. `updatePaymentInputSchema` **tanpa** `paymentStatus`.

- [ ] **Step 1: Buat `lib/actions/payments.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  recordPaymentForUser,
  regenerateReceiptForUser,
  voidPaymentForUser,
} from "@/lib/actions/payments-logic";
import {
  recordPaymentInputSchema,
  regenerateReceiptInputSchema,
  voidPaymentInputSchema,
} from "@/lib/actions/payments-schemas";
import { adminActionClient } from "@/lib/actions/safe-action";

/**
 * Server action ledger pembayaran. Logika + guard ada di `payments-logic.ts`
 * (diuji langsung); `adminActionClient` di sini adalah penegakan utama aturan
 * admin-only yang terikat request — bukan penggantinya, melainkan lapis
 * pertamanya.
 */

export const recordPayment = adminActionClient
  .inputSchema(recordPaymentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const payment = await recordPaymentForUser(ctx.user, parsedInput);
    revalidatePath(`/dashboard/projects/${payment.projectId}`);
    revalidatePath("/dashboard");
    return { success: true as const, payment };
  });

export const voidPayment = adminActionClient
  .inputSchema(voidPaymentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const payment = await voidPaymentForUser(ctx.user, parsedInput);
    revalidatePath(`/dashboard/projects/${payment.projectId}`);
    revalidatePath("/dashboard");
    return { success: true as const, payment };
  });

export const regenerateReceipt = adminActionClient
  .inputSchema(regenerateReceiptInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const payment = await regenerateReceiptForUser(ctx.user, parsedInput);
    revalidatePath(`/dashboard/projects/${payment.projectId}`);
    return { success: true as const, payment };
  });
```

- [ ] **Step 2: Buang `paymentStatus` dari `lib/actions/finance-schemas.ts`**

Ganti `updatePaymentInputSchema` menjadi:

```ts
/**
 * `paymentStatus` SENGAJA tidak ada di sini. Sejak ledger pembayaran masuk
 * (spec 2026-07-14) status adalah kolom TURUNAN — dihitung dari uang yang
 * benar-benar masuk oleh `recomputePaymentStatus`. Menerimanya kembali sebagai
 * input berarti mengizinkan seseorang menandai proyek "lunas" tanpa satu rupiah
 * pun tercatat, dan itulah persis penyakit yang fitur ini obati.
 */
export const updatePaymentInputSchema = z.object({
  projectId: z.uuid(),
  projectValue: z.number().int().nonnegative().nullable(),
  paymentNotes: z.string().trim().max(2000).optional(),
});
export type UpdatePaymentInput = z.infer<typeof updatePaymentInputSchema>;
```

`paymentStatusSchema` dan tipe `PaymentStatus` **tetap** — keduanya masih dipakai untuk menampilkan status.

- [ ] **Step 3: `updatePaymentForUser` menghitung ulang status**

Di `lib/actions/finance-logic.ts`, ganti `updatePaymentForUser`:

```ts
/**
 * Admin-only. Mengatur `projectValue` / `paymentNotes`. TIDAK lagi menerima
 * `paymentStatus` — status diturunkan dari ledger (`recomputePaymentStatus`),
 * dan mengubah nilai proyek bisa memindahkannya (nilai turun bisa membuat
 * proyek jadi lunas; naik bisa membuatnya kembali sebagian), jadi hitung ulang
 * itu terjadi di dalam transaksi yang sama.
 */
export async function updatePaymentForUser(user: SessionUser, input: UpdatePaymentInput) {
  requireAdmin(user);
  await assertProjectAccessOrReject(input.projectId, user);

  const totalPaid = await totalPaidForProject(input.projectId);
  if ((input.projectValue == null || input.projectValue === 0) && totalPaid > 0) {
    // Menghapus nilai proyek yang sudah ada uangnya membuat "sisa tagihan" dan
    // "lunas" kehilangan arti — dan diam-diam menghapus piutang dari dashboard.
    throw new Error(
      "Nilai proyek tidak bisa dikosongkan: proyek ini sudah punya pembayaran tercatat.",
    );
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(projects)
      .set({
        projectValue: input.projectValue,
        paymentNotes:
          input.paymentNotes && input.paymentNotes.length > 0 ? input.paymentNotes : null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, input.projectId))
      .returning();
    if (!updated) throw new Error("Project not found.");

    const status = await recomputePaymentStatus(tx, input.projectId);
    return { ...updated, paymentStatus: status };
  });
}
```

Tambahkan import & helper di berkas yang sama:

```ts
import { and, eq, isNull, sql } from "drizzle-orm";
import { recomputePaymentStatus } from "@/lib/actions/payments-logic";
import { payments, projects } from "@/lib/db/schema";

async function totalPaidForProject(projectId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
    .from(payments)
    .where(and(eq(payments.projectId, projectId), isNull(payments.voidedAt)));
  return row?.total ?? 0;
}
```

- [ ] **Step 4: Perbarui `lib/actions/finance.test.ts`**

Buang `paymentStatus` dari setiap pemanggilan `updatePaymentForUser`, dan ganti assertion status jadi turunan. Tambahkan `await db.delete(payments);` sebagai baris pertama blok delete di `beforeAll`, dan `payments` ke import schema.

Ganti test "the admin CAN update payment info":

```ts
  it("the admin CAN update payment info — dan status TIDAK bisa lagi diketik", async () => {
    const updated = await updatePaymentForUser(admin, {
      projectId,
      projectValue: 5_000_000,
      paymentNotes: "Menunggu transfer.",
    });
    expect(updated.projectValue).toBe(5_000_000);
    expect(updated.paymentNotes).toBe("Menunggu transfer.");
    // Belum ada satu pun baris pembayaran, jadi status HARUS `belum` —
    // tidak peduli apa yang diinginkan pemanggil.
    expect(updated.paymentStatus).toBe("belum");
  });

  it("nilai proyek tidak bisa dikosongkan kalau sudah ada pembayaran", async () => {
    await recordPaymentForUser(
      admin,
      { projectId, amount: 1_000_000, paidAt: "2026-07-14", method: "tunai" },
      { put: async (key: string) => `/api/storage/${key}` },
    );

    await expect(
      updatePaymentForUser(admin, { projectId, projectValue: null }),
    ).rejects.toThrow();
  });
```

Import `recordPaymentForUser` dari `@/lib/actions/payments-logic` di berkas test itu.

- [ ] **Step 5: Buang dropdown status dari `components/projects/payment-form.tsx`**

- Hapus field `paymentStatus` dari `PaymentFormValues`, dari `defaultValues`, dari payload `executeAsync`, dan hapus seluruh blok `<Controller name="paymentStatus" ...>` beserta `<Label htmlFor="paymentStatus">`.
- Hapus prop `paymentStatus` dari signature komponen.
- Hapus import `Controller`, `SelectField`, `optionsFromLabels`, `paymentStatusLabel`, dan `PaymentStatus` kalau tidak lagi terpakai (Biome akan mengeluh kalau tersisa).
- Ganti komentar blok di atas komponen jadi:

```tsx
/**
 * Admin-only. Mengatur nilai proyek + catatan.
 *
 * TIDAK ada dropdown status pembayaran: status adalah kolom TURUNAN dari ledger
 * (`recomputePaymentStatus`). Uang dicatat lewat panel Pembayaran, dan statusnya
 * mengikuti — bukan sebaliknya.
 */
```

- [ ] **Step 6: Jalankan test terkait**

Run: `pnpm test lib/actions/finance.test.ts lib/actions/payments.test.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: 0 error. Kalau ada yang merah di `app/dashboard/projects/[id]/page.tsx` karena prop `paymentStatus` — biarkan, Task 10 memperbaikinya. Kalau mau hijau sekarang, hapus prop itu dari pemanggilan `<PaymentForm>`.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/payments.ts lib/actions/finance-schemas.ts lib/actions/finance-logic.ts lib/actions/finance.test.ts components/projects/payment-form.tsx
git commit -m "feat(keuangan): status bayar jadi turunan — dropdown manual dibuang"
```

---

### Task 9: Piutang dashboard jadi eksak

**Files:**
- Modify: `lib/actions/dashboard-logic.ts`
- Modify: `lib/actions/dashboard.test.ts`

**Interfaces:**
- Consumes: tabel `payments` (Task 1).
- Produces: `AdminDashboardData.totalUnpaid` yang eksak. Bentuk tipenya **tidak berubah**.

- [ ] **Step 1: Tulis test yang gagal**

Di `lib/actions/dashboard.test.ts`: tambahkan `payments` ke import schema, tambahkan `await db.delete(payments);` sebagai baris pertama blok delete, lalu tambahkan test:

```ts
  it("totalUnpaid memotong uang yang sudah masuk, bukan menghitung nilai proyek penuh", async () => {
    // Proyek 10jt, DP 4jt sudah masuk. Piutangnya 6jt — bukan 10jt.
    const [project] = await db
      .insert(projects)
      .values({
        title: "Piutang Fixture",
        clientId: fixtureClientId,
        surveyType: "kavling",
        status: "diproses",
        projectValue: 10_000_000,
        paymentStatus: "sebagian",
      })
      .returning();

    await db.insert(payments).values({
      projectId: project.id,
      amount: 4_000_000,
      paidAt: "2026-07-14",
      method: "transfer",
      receiptNumber: `KW/PKP/2026/${Date.now()}`,
      recordedById: admin.id,
    });

    const data = await getAdminDashboardData(admin);
    expect(data.totalUnpaid).toBe(6_000_000);
  });

  it("pembayaran yang dibatalkan tidak mengurangi piutang", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        title: "Piutang Batal Fixture",
        clientId: fixtureClientId,
        surveyType: "kavling",
        status: "diproses",
        projectValue: 3_000_000,
        paymentStatus: "belum",
      })
      .returning();

    await db.insert(payments).values({
      projectId: project.id,
      amount: 3_000_000,
      paidAt: "2026-07-14",
      method: "transfer",
      receiptNumber: `KW/PKP/2026/${Date.now() + 1}`,
      recordedById: admin.id,
      voidedAt: new Date(),
      voidedReason: "Salah proyek",
      voidedById: admin.id,
    });

    const data = await getAdminDashboardData(admin);
    // Uangnya dibatalkan, jadi piutangnya utuh 3jt — bukan 0.
    expect(data.totalUnpaid).toBeGreaterThanOrEqual(3_000_000);
  });
```

Sesuaikan `fixtureClientId` / `admin` dengan nama variabel fixture yang sudah ada di berkas itu. Kalau belum ada `fixtureClientId`, ambil dari baris `clients` yang sudah di-insert `beforeAll`. **Jangan mengubah test lain** yang sudah ada di berkas itu.

Untuk kedua test ini, sesuaikan angka harapan dengan fixture yang sudah ada di `beforeAll` — kalau fixture lain juga punya piutang, pakai selisih: ambil `totalUnpaid` sebelum insert, lalu bandingkan selisihnya. Yang dikunci adalah **6.000.000 tambahan**, bukan angka absolut.

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm test lib/actions/dashboard.test.ts`
Expected: FAIL — `totalUnpaid` masih menghitung 10.000.000 penuh untuk proyek yang DP-nya sudah masuk.

- [ ] **Step 3: Implementasi**

Di `lib/actions/dashboard-logic.ts`:

```ts
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { clients, payments, users } from "@/lib/db/schema";
```

Hapus konstanta `UNPAID_STATUSES` (tidak lagi dipakai) dan tambahkan helper:

```ts
/** Uang yang sudah masuk per proyek (baris batal TIDAK dihitung). */
async function paidByProject(projectIds: string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      projectId: payments.projectId,
      paid: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(and(inArray(payments.projectId, projectIds), isNull(payments.voidedAt)))
    .groupBy(payments.projectId);
  return new Map(rows.map((r) => [r.projectId, r.paid]));
}
```

Di `getAdminDashboardData`, ganti perhitungan `totalUnpaid`:

```ts
  const paid = await paidByProject(allProjects.map((p) => p.id));

  const countsByStatus: Record<string, number> = {};
  let totalActiveValue = 0;
  let totalUnpaid = 0;
  for (const p of allProjects) {
    countsByStatus[p.status] = (countsByStatus[p.status] ?? 0) + 1;
    if (!INACTIVE_STATUSES.has(p.status)) {
      totalActiveValue += p.projectValue ?? 0;
    }
    // Piutang EKSAK: nilai proyek dikurangi uang yang sudah benar-benar masuk.
    // Dulu ini menjumlahkan `projectValue` PENUH untuk setiap proyek yang belum
    // lunas, jadi proyek yang DP-nya 80% masuk tetap dihitung sebagai piutang
    // penuh — angkanya selalu lebih besar dari kenyataan. `dibatalkan` tetap
    // dikecualikan: piutang proyek batal bukan pendapatan yang tertunda.
    if (p.status !== CANCELLED_STATUS) {
      totalUnpaid += Math.max(0, (p.projectValue ?? 0) - (paid.get(p.id) ?? 0));
    }
  }
```

Perbarui juga komentar blok di kepala berkas (yang menjelaskan `totalUnpaid` lama) supaya cocok.

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm test lib/actions/dashboard.test.ts`
Expected: PASS, termasuk test regresi lama (payload surveyor tidak memuat field keuangan).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/dashboard-logic.ts lib/actions/dashboard.test.ts
git commit -m "fix(dashboard): piutang eksak — potong uang yang sudah masuk"
```

---

### Task 10: Panel pembayaran (owner)

**Files:**
- Create: `components/payments/payments-panel.tsx`
- Create: `components/payments/record-payment-dialog.tsx`
- Create: `components/payments/void-payment-dialog.tsx`
- Modify: `app/dashboard/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `recordPayment` / `voidPayment` / `regenerateReceipt` (Task 8), `listPaymentsForProject` / `getPaymentSummary` (Task 7), `downloadUrlFor` (`@/lib/storage`), `formatIDR` / `formatTanggalIndo`, `paymentMethodLabel` / `paymentStatusLabel`.
- Produces: `<PaymentsPanel>` — dipakai HANYA di dalam cabang `"projectValue" in project` (admin) di halaman detail proyek.

Catatan penting: **jangan** melakukan `await downloadUrlFor()` di komponen klien. URL unduhan dirakit di Server Component (halaman) dan diserahkan ke panel sebagai prop `downloadUrl` per baris — pola yang sama dengan `DocumentsTable`.

- [ ] **Step 1: `components/payments/record-payment-dialog.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { optionsFromLabels, SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { recordPayment } from "@/lib/actions/payments";
import type { PaymentMethod } from "@/lib/actions/payments-schemas";
import { paymentMethodLabel } from "@/lib/labels";

type FormValues = {
  amount: string;
  paidAt: string;
  method: PaymentMethod;
  note: string;
};

function today(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function RecordPaymentDialog({
  projectId,
  disabled,
}: {
  projectId: string;
  /** True kalau nilai proyek belum diisi — mencatat uang tanpa nilai proyek tidak punya arti. */
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { amount: "", paidAt: today(), method: "transfer", note: "" },
  });
  const { executeAsync } = useAction(recordPayment);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const amount = Number(values.amount.trim());
    if (!Number.isInteger(amount) || amount <= 0) {
      setFormError("Jumlah pembayaran harus bilangan bulat lebih dari 0.");
      return;
    }

    const result = await executeAsync({
      projectId,
      amount,
      paidAt: values.paidAt,
      method: values.method,
      note: values.note.trim() || undefined,
    });

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali data yang dimasukkan.");
      return;
    }

    reset({ amount: "", paidAt: today(), method: "transfer", note: "" });
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} className="w-fit">
          Catat pembayaran
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat pembayaran</DialogTitle>
          <DialogDescription>
            Kwitansi ber-nomor otomatis diterbitkan. Kalau salah, batalkan lalu catat ulang —
            baris pembayaran tidak bisa diedit.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Jumlah (IDR)</Label>
            <Input id="amount" type="number" min={1} step={1} {...register("amount")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paidAt">Tanggal uang diterima</Label>
            <Input id="paidAt" type="date" {...register("paidAt")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="method">Metode</Label>
            <Controller
              control={control}
              name="method"
              render={({ field }) => (
                <SelectField
                  id="method"
                  className="w-full"
                  options={optionsFromLabels(paymentMethodLabel)}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Catatan</Label>
            <Textarea id="note" rows={2} placeholder="mis. DP 50% via BCA" {...register("note")} />
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Kalau `components/ui/dialog.tsx` tidak mengekspor persis nama-nama itu, sesuaikan dengan yang ada di sana — **jangan** menambah komponen dialog baru.

- [ ] **Step 2: `components/payments/void-payment-dialog.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { voidPayment } from "@/lib/actions/payments";

export function VoidPaymentDialog({
  paymentId,
  receiptNumber,
}: {
  paymentId: string;
  receiptNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  const { executeAsync } = useAction(voidPayment);

  const onSubmit = async ({ reason }: { reason: string }) => {
    setFormError(null);
    const result = await executeAsync({ paymentId, reason: reason.trim() });
    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Tulis alasan pembatalan (minimal 3 karakter).");
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Batalkan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan {receiptNumber}?</DialogTitle>
          <DialogDescription>
            Barisnya tidak dihapus — ia ditandai dibatalkan dan berhenti dihitung. Kwitansinya
            diterbitkan ulang dengan cap DIBATALKAN. Untuk mengoreksi, catat pembayaran baru
            setelah ini.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Alasan pembatalan</Label>
            <Textarea id="reason" rows={2} {...register("reason")} />
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? "Membatalkan..." : "Batalkan pembayaran"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: `components/payments/payments-panel.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { VoidPaymentDialog } from "@/components/payments/void-payment-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { regenerateReceipt } from "@/lib/actions/payments";
import { formatIDR, formatTanggalIndo } from "@/lib/format";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/labels";

export type PaymentPanelRow = {
  id: string;
  amount: number;
  paidAt: string;
  method: string;
  note: string | null;
  receiptNumber: string;
  /** Sudah ditandatangani di server (presigned). Null = kwitansi belum terbit. */
  downloadUrl: string | null;
  voidedReason: string | null;
  isVoided: boolean;
};

export function PaymentsPanel({
  projectId,
  rows,
  projectValue,
  totalPaid,
  remaining,
  status,
}: {
  projectId: string;
  rows: PaymentPanelRow[];
  projectValue: number | null;
  totalPaid: number;
  remaining: number;
  status: string;
}) {
  const router = useRouter();
  const { executeAsync, isPending } = useAction(regenerateReceipt);
  const hasValue = projectValue != null && projectValue > 0;
  const overpaid = hasValue && totalPaid > projectValue;

  const onRegenerate = async (paymentId: string) => {
    await executeAsync({ paymentId });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Nilai proyek</p>
          <p className="text-sm">{formatIDR(projectValue)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Terbayar</p>
          <p className="text-sm">{formatIDR(totalPaid)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sisa</p>
          <p className="text-sm">{formatIDR(remaining)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{paymentStatusLabel[status] ?? status}</Badge>
            {overpaid ? (
              <Badge variant="outline">
                Lebih bayar {formatIDR(totalPaid - (projectValue ?? 0))}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <RecordPaymentDialog projectId={projectId} disabled={!hasValue} />

      {!hasValue ? (
        <p className="text-sm text-muted-foreground">
          Isi nilai proyek dulu di form di atas — tanpa itu "sisa tagihan" dan "lunas" tidak punya
          arti.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada pembayaran tercatat.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Jumlah</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Catatan</TableHead>
              <TableHead>Kwitansi</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className={row.isVoided ? "text-muted-foreground" : undefined}>
                <TableCell>{formatTanggalIndo(row.paidAt)}</TableCell>
                <TableCell className={row.isVoided ? "line-through" : undefined}>
                  {formatIDR(row.amount)}
                </TableCell>
                <TableCell>{paymentMethodLabel[row.method] ?? row.method}</TableCell>
                <TableCell className="max-w-[220px] truncate">
                  {row.isVoided ? `Dibatalkan: ${row.voidedReason ?? "—"}` : (row.note ?? "—")}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.receiptNumber}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  {row.downloadUrl ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={row.downloadUrl} target="_blank" rel="noreferrer">
                        Unduh
                      </a>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => onRegenerate(row.id)}
                    >
                      Buat kwitansi
                    </Button>
                  )}
                  {row.isVoided ? null : (
                    <VoidPaymentDialog paymentId={row.id} receiptNumber={row.receiptNumber} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rakit di halaman detail proyek**

Di `app/dashboard/projects/[id]/page.tsx`, di dalam blok `{"projectValue" in project ? (` — **hanya di sana**, karena cabang itu satu-satunya yang admin — ambil data dan render panel.

Tambahkan import:

```ts
import { PaymentsPanel } from "@/components/payments/payments-panel";
import { getPaymentSummary, listPaymentsForProject } from "@/lib/actions/payments-logic";
```

Di badan fungsi halaman, setelah `const mapLayerRows = ...`, tambahkan:

```ts
  // Ledger pembayaran HANYA untuk admin. Memanggilnya untuk surveyor akan
  // ditolak server-side — tapi jangan bergantung pada itu: jangan panggil sama
  // sekali, supaya tidak ada apa pun yang bisa masuk ke payload non-admin.
  const isAdmin = user.role === "admin";
  const paymentRows = isAdmin ? await listPaymentsForProject(user, project.id) : [];
  const paymentSummary = isAdmin ? await getPaymentSummary(user, project.id) : null;
  const paymentPanelRows = await Promise.all(
    paymentRows.map(async (p) => ({
      id: p.id,
      amount: p.amount,
      paidAt: p.paidAt,
      method: p.method,
      note: p.note,
      receiptNumber: p.receiptNumber,
      downloadUrl: p.receiptFileUrl ? await downloadUrlFor(p.receiptFileUrl) : null,
      voidedReason: p.voidedReason,
      isVoided: p.voidedAt !== null,
    })),
  );
```

Lalu, di dalam `<TabsContent value="keuangan">`, **ganti** kartu "Status saat ini" yang lama dengan kartu Pembayaran, dan ubah judul kartu form jadi "Nilai proyek & catatan":

```tsx
            {paymentSummary ? (
              <Card>
                <CardHeader>
                  <CardTitle>Pembayaran</CardTitle>
                </CardHeader>
                <CardContent>
                  <PaymentsPanel
                    projectId={project.id}
                    rows={paymentPanelRows}
                    projectValue={paymentSummary.projectValue}
                    totalPaid={paymentSummary.totalPaid}
                    remaining={paymentSummary.remaining}
                    status={paymentSummary.status}
                  />
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Nilai proyek & catatan</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentForm
                  projectId={project.id}
                  projectValue={project.projectValue}
                  paymentNotes={project.paymentNotes}
                />
              </CardContent>
            </Card>
```

Hapus import `PaymentStatus` dan `paymentStatusLabel` dari halaman itu kalau sudah tidak terpakai (Biome akan menandainya).

- [ ] **Step 5: Typecheck + lint + test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 0 error, semua test hijau.

- [ ] **Step 6: Commit**

```bash
git add components/payments "app/dashboard/projects/[id]/page.tsx"
git commit -m "feat(pembayaran): panel ledger + kwitansi di halaman proyek (admin)"
```

---

### Task 11: Pembayaran di portal klien

**Files:**
- Create: `components/payments/portal-payments.tsx`
- Modify: `app/portal/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `listPaymentsForProject` / `getPaymentSummary` (Task 7 — keduanya sudah menyaring baris batal untuk peran `client`), `downloadUrlFor`.
- Produces: `<PortalPayments>` — read-only, tanpa aksi.

- [ ] **Step 1: `components/payments/portal-payments.tsx`**

Server Component (tidak ada `"use client"` — tidak ada interaksi, cuma tampilan + tautan unduh).

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIDR, formatTanggalIndo } from "@/lib/format";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/labels";

export type PortalPaymentRow = {
  id: string;
  amount: number;
  paidAt: string;
  method: string;
  receiptNumber: string;
  downloadUrl: string | null;
};

/**
 * Pembayaran di portal klien: read-only, dan HANYA baris yang tidak dibatalkan
 * (`listPaymentsForProject` sudah menyaringnya untuk peran `client`). Baris
 * batal bukan bagian dari catatan uang klien; menampilkannya cuma memancing
 * pertanyaan yang tidak perlu.
 */
export function PortalPayments({
  rows,
  projectValue,
  totalPaid,
  remaining,
  status,
  paymentNotes,
}: {
  rows: PortalPaymentRow[];
  projectValue: number | null;
  totalPaid: number;
  remaining: number;
  status: string;
  paymentNotes: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Nilai proyek</p>
          <p className="text-sm">{formatIDR(projectValue)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sudah dibayar</p>
          <p className="text-sm">{formatIDR(totalPaid)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sisa</p>
          <p className="text-sm">{formatIDR(remaining)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="text-sm">{paymentStatusLabel[status] ?? status}</p>
        </div>
      </div>

      {paymentNotes ? (
        <div>
          <p className="text-xs text-muted-foreground">Catatan</p>
          <p className="text-sm">{paymentNotes}</p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada pembayaran tercatat.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Jumlah</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Kwitansi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatTanggalIndo(row.paidAt)}</TableCell>
                <TableCell>{formatIDR(row.amount)}</TableCell>
                <TableCell>{paymentMethodLabel[row.method] ?? row.method}</TableCell>
                <TableCell>
                  {row.downloadUrl ? (
                    <a
                      href={row.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline underline-offset-4"
                    >
                      {row.receiptNumber}
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.receiptNumber}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Pakai di `app/portal/projects/[id]/page.tsx`**

Tambahkan import:

```ts
import { PortalPayments } from "@/components/payments/portal-payments";
import { getPaymentSummary, listPaymentsForProject } from "@/lib/actions/payments-logic";
```

Setelah `const documentRows = ...`, tambahkan:

```ts
  const paymentRows = await listPaymentsForProject(user, project.id);
  const paymentSummary = await getPaymentSummary(user, project.id);
  const paymentTableRows = await Promise.all(
    paymentRows.map(async (p) => ({
      id: p.id,
      amount: p.amount,
      paidAt: p.paidAt,
      method: p.method,
      receiptNumber: p.receiptNumber,
      downloadUrl: p.receiptFileUrl ? await downloadUrlFor(p.receiptFileUrl) : null,
    })),
  );
```

**Ganti seluruh** `<Card>` "Nilai & pembayaran" yang lama dengan:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Nilai & pembayaran</CardTitle>
        </CardHeader>
        <CardContent>
          <PortalPayments
            rows={paymentTableRows}
            projectValue={paymentSummary.projectValue}
            totalPaid={paymentSummary.totalPaid}
            remaining={paymentSummary.remaining}
            status={paymentSummary.status}
            paymentNotes={project.paymentNotes}
          />
        </CardContent>
      </Card>
```

Hapus import `formatIDR` / `paymentStatusLabel` dari halaman itu kalau sudah tidak terpakai.

- [ ] **Step 3: Typecheck + lint + seluruh test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 0 error, semua test hijau.

- [ ] **Step 4: Commit**

```bash
git add components/payments/portal-payments.tsx "app/portal/projects/[id]/page.tsx"
git commit -m "feat(portal): klien lihat riwayat pembayaran, sisa tagihan, dan kwitansinya"
```

---

### Task 12: Verifikasi menyeluruh + catat di `tasks.md`

**Files:**
- Modify: `tasks.md`

- [ ] **Step 1: Verifikasi lokal penuh**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: keempatnya lulus. **Jangan** klaim selesai sebelum melihat outputnya sendiri.

- [ ] **Step 2: Jalankan aplikasi dan buktikan alurnya sungguhan**

```bash
pnpm db:seed
pnpm dev
```

Sebagai **admin** (kredensial dari `lib/db/seed.ts`):
1. Buka proyek yang punya nilai. Tab Keuangan → panel Pembayaran muncul.
2. Catat pembayaran. Kwitansi ber-nomor terbit; unduh PDF-nya dan **buka** — nomor, nama klien, terbilang, dan sisa tagihan harus benar.
3. Status proyek berpindah sendiri ke `sebagian` / `lunas` — tanpa dropdown apa pun.
4. Batalkan pembayaran itu. Statusnya mundur; unduh ulang kwitansinya → membawa cap DIBATALKAN.
5. Dashboard: "total belum terbayar" turun sebesar uang yang masuk.

Sebagai **surveyor**: buka proyek yang di-assign ke dia → tab Keuangan **tidak ada**. Tempel URL kwitansi yang tadi diunduh admin → **404**.

Sebagai **klien** pemilik proyek: `/portal/projects/<id>` → riwayat pembayaran + sisa tagihan + tautan kwitansi yang bisa diunduh. Baris yang dibatalkan **tidak muncul**.

- [ ] **Step 3: Perbarui `tasks.md`**

Tambahkan setelah Phase 11:

```markdown
## Phase 12 — Ledger pembayaran & kwitansi  *(kode selesai)*
> Spec: `docs/superpowers/specs/2026-07-14-ledger-pembayaran-kwitansi-design.md`.
> Menyerang keluhan "nilai proyek tanpa bukti bayar": `paymentStatus` dulu cuma
> dropdown yang tidak terhubung ke uang mana pun, dan `sebagian` tidak menyimpan
> BERAPA yang sudah masuk.
- [x] Tabel `payment` append-only (koreksi = batalkan + terbitkan ulang, bukan edit)
      — jejak uang tidak pernah ditimpa diam-diam.
- [x] `paymentStatus` jadi kolom TURUNAN, dihitung ulang di dalam transaksi yang sama
      dengan setiap perubahan yang memicunya. Dropdown manualnya dibuang: owner tidak
      bisa lagi menandai proyek lunas tanpa mencatat uangnya.
- [x] Kwitansi PDF ber-nomor (sequence Postgres — tidak bisa kembar), disimpan di R2 di
      bawah prefix `receipts/`. Pembatalan menerbitkan ulang PDF dengan cap DIBATALKAN.
- [x] Kwitansi **bukan** baris `documents`: modul Arsip terlihat surveyor, dan kwitansi
      memuat nilai proyek. Ia hidup di `payment.receiptFileUrl`, di balik guard keuangan.
      Rute storage lokal menolak surveyor untuk prefix `receipts/` secara eksplisit —
      `assertProjectAccess` MELOLOSKAN surveyor yang di-assign, jadi ia tidak cukup.
- [x] Kwitansi di-generate DI LUAR transaksi, errornya ditelan + di-log. Dikunci test:
      "pembayaran TETAP tercatat walau kwitansi gagal dibuat" — jeblok kalau try/catch
      dicabut. Alasan sama dengan notifikasi Phase 11: pekerjaan sampingan tidak boleh
      mengalahkan pekerjaan sungguhan.
- [x] Piutang dashboard jadi eksak (nilai proyek − uang yang benar-benar masuk); dulu
      menghitung `projectValue` PENUH untuk proyek yang DP-nya sudah 80% masuk.
- [x] Portal klien: riwayat pembayaran, sisa tagihan, unduh kwitansi sendiri.
- [ ] **Human action** — ganti `lib/studio-identity.ts` dengan data PKP sungguhan (alamat,
      telepon, penanda tangan) sebelum kwitansi pertama dikirim ke klien. Sekarang masih
      berisi placeholder.
```

- [ ] **Step 4: Commit**

```bash
git add tasks.md
git commit -m "docs(tasks): Phase 12 — ledger pembayaran & kwitansi"
```

---

## Catatan untuk pelaksana

- **Jangan** menyimpan kwitansi sebagai baris `documents`, dengan alasan apa pun. Kalau
  terasa menggoda ("kan tinggal difilter"), baca ulang Bagian 3 spec: setiap query dokumen
  harus ingat mengecualikannya, dan satu jalur yang lupa membocorkan nilai proyek ke
  surveyor.
- **Jangan** memakai `assertProjectAccess` sebagai satu-satunya guard di modul ini. Ia
  meloloskan surveyor yang di-assign. `requireAdmin` harus mendahuluinya.
- **Jangan** memindahkan generate kwitansi ke dalam transaksi "supaya konsisten". Konsistensi
  yang dibeli tidak sepadan: R2 down akan membuat studio tidak bisa mencatat uang yang sudah
  masuk.
- Kalau sebuah test tidak pernah kamu lihat merah, kamu belum tahu ia menjaga apa pun.
  Task 7 Step 6 ada persis untuk itu — jangan dilewati.
