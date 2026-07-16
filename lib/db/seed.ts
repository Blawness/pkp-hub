import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "./index";
import {
  accounts,
  clients,
  documents,
  equipment,
  equipmentUsage,
  mapLayers,
  payments,
  projectPhases,
  projectStatusLogs,
  projects,
  sessions,
  users,
} from "./schema";

/** Dev seed password for all seeded users, hashed via Better Auth's own hasher. */
const SEED_PASSWORD = "password123";

/**
 * Dev seed. Every seeded user gets a working `password123` credential,
 * hashed with Better Auth's own `hashPassword` (never hand-rolled) and
 * stored in the `account` table it owns.
 *
 * NON-DESTRUKTIF secara default: kalau data seed sudah ada (dideteksi lewat
 * user sentinel `admin@pkp.test`), seed berhenti tanpa menyentuh apa pun —
 * jadi menjalankannya ulang TIDAK menghapus data dev yang kamu masukkan
 * manual. Untuk wipe + seed ulang dari nol, set `SEED_RESET=1` (lihat script
 * `db:seed:reset`). Test memakai flag itu supaya tiap run mulai dari data
 * demo yang bersih.
 */
async function seed() {
  const force = ["1", "true"].includes(process.env.SEED_RESET ?? "");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "admin@pkp.test"))
    .limit(1);

  if (existing && !force) {
    console.log(
      "seed SKIP: data seed sudah ada (admin@pkp.test). " +
        "Data tidak disentuh. Pakai `SEED_RESET=1 pnpm db:seed` " +
        "(atau `pnpm db:seed:reset`) untuk wipe & seed ulang.",
    );
    process.exit(0);
  }

  if (force) {
    // FK-safe teardown so the seed is re-runnable. `equipmentUsage` sebelum
    // `equipment` (FK), dan keduanya sebelum `projects`/`users` — sesi pakai
    // menunjuk ke keduanya.
    await db.delete(equipmentUsage);
    await db.delete(equipment);
    await db.delete(payments);
    await db.delete(documents);
    await db.delete(mapLayers);
    await db.delete(projectStatusLogs);
    await db.delete(projectPhases);
    await db.delete(projects);
    await db.delete(clients);
    await db.delete(sessions);
    await db.delete(accounts);
    await db.delete(users);
  }

  const adminId = randomUUID();
  const surveyor1Id = randomUUID();
  const surveyor2Id = randomUUID();
  const clientUserId = randomUUID();

  await db.insert(users).values([
    { id: adminId, name: "Yudha Hafiz", email: "admin@pkp.test", role: "admin" },
    { id: surveyor1Id, name: "Bagas Nugroho", email: "bagas@pkp.test", role: "surveyor" },
    { id: surveyor2Id, name: "Rizky Ananda", email: "rizky@pkp.test", role: "surveyor" },
    { id: clientUserId, name: "Andi Wijaya", email: "andi@klien.test", role: "client" },
  ]);

  const hashedPassword = await hashPassword(SEED_PASSWORD);
  await db.insert(accounts).values(
    [adminId, surveyor1Id, surveyor2Id, clientUserId].map((userId) => ({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashedPassword,
    })),
  );

  const [budi, cahaya, dewi] = await db
    .insert(clients)
    .values([
      {
        name: "Andi Wijaya",
        type: "individual",
        phone: "081234567890",
        email: "andi@klien.test",
        address: "Jl. Merdeka No. 12, Bandung",
        notes: "Klien perorangan, punya akun portal.",
        userId: clientUserId,
      },
      {
        name: "PT Cahaya Properti",
        type: "company",
        phone: "0221234567",
        email: "kontak@cahayaproperti.test",
        address: "Jl. Sudirman Kav. 5, Jakarta Selatan",
        notes: "Developer perumahan, proyek kavling berulang.",
      },
      {
        name: "Dewi Kartika",
        type: "individual",
        phone: "085611122233",
        email: "dewi@klien.test",
        address: "Jl. Kaliurang KM 7, Sleman",
      },
    ])
    .returning();

  const inserted = await db
    .insert(projects)
    .values([
      {
        title: "Pengukuran batas tanah Cimahi",
        clientId: budi.id,
        surveyType: "batas_tanah",
        locationLabel: "Cimahi Utara, Kota Cimahi",
        assignedSurveyorId: surveyor1Id,
        status: "selesai",
        description: "Sengketa batas dengan tetangga sebelah timur.",
        projectValue: 7_500_000,
        paymentStatus: "lunas",
        paymentNotes: "Transfer BCA 2026-05-02.",
      },
      {
        title: "Topografi lahan perumahan tahap 2",
        clientId: cahaya.id,
        surveyType: "topografi",
        locationLabel: "Desa Sukamaju, Bogor",
        assignedSurveyorId: surveyor2Id,
        status: "diproses",
        description: "Lahan 3.2 ha, kontur untuk siteplan.",
        projectValue: 42_000_000,
        paymentStatus: "sebagian",
        paymentNotes: "DP 50% masuk 2026-06-20.",
      },
      {
        title: "Kavling blok C — 18 unit",
        clientId: cahaya.id,
        surveyType: "kavling",
        locationLabel: "Desa Sukamaju, Bogor",
        assignedSurveyorId: surveyor1Id,
        status: "data_diambil",
        projectValue: 28_000_000,
        paymentStatus: "belum",
      },
      {
        title: "Luas bangunan ruko Jl. Kaliurang",
        clientId: dewi.id,
        surveyType: "luas_bangunan",
        locationLabel: "Sleman, DIY",
        status: "baru",
        description: "Belum dijadwalkan, menunggu konfirmasi klien.",
      },
      {
        title: "Survey kavling Sentul (dibatalkan)",
        clientId: dewi.id,
        surveyType: "kavling",
        locationLabel: "Sentul, Bogor",
        status: "dibatalkan",
        description: "Klien membatalkan, lahan sudah terjual.",
      },
    ])
    .returning();

  // Riwayat status (PRD Feature 2) untuk proyek yang sudah bergerak.
  const [batas, topografi, kavling] = inserted;

  // Ledger pembayaran demo. Angkanya sengaja dibuat cocok dengan
  // `paymentStatus` tiap proyek — status itu sekarang TURUNAN, jadi seed yang
  // tidak konsisten akan langsung terlihat salah di UI.
  const lunasProject = inserted.find((p) => p.paymentStatus === "lunas");
  const sebagianProject = inserted.find((p) => p.paymentStatus === "sebagian");

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

  // Sequence nomor kwitansi tidak di-increment oleh seed di atas (ia memakai
  // nomor hardcode), jadi dorong ke angka di atas nomor demo agar pembayaran
  // sungguhan pertama tidak menabrak constraint UNIQUE `receipt_number`.
  await db.execute(sql`SELECT setval('receipt_number_seq', 2)`);

  await db.insert(projectStatusLogs).values([
    { projectId: batas.id, fromStatus: null, toStatus: "baru", changedById: adminId },
    { projectId: batas.id, fromStatus: "baru", toStatus: "dijadwalkan", changedById: adminId },
    {
      projectId: batas.id,
      fromStatus: "dijadwalkan",
      toStatus: "data_diambil",
      changedById: surveyor1Id,
    },
    {
      projectId: batas.id,
      fromStatus: "data_diambil",
      toStatus: "diproses",
      changedById: surveyor1Id,
    },
    { projectId: batas.id, fromStatus: "diproses", toStatus: "selesai", changedById: adminId },
    { projectId: topografi.id, fromStatus: null, toStatus: "baru", changedById: adminId },
    {
      projectId: topografi.id,
      fromStatus: "baru",
      toStatus: "dijadwalkan",
      changedById: adminId,
    },
    {
      projectId: topografi.id,
      fromStatus: "dijadwalkan",
      toStatus: "data_diambil",
      changedById: surveyor2Id,
    },
    {
      projectId: topografi.id,
      fromStatus: "data_diambil",
      toStatus: "diproses",
      changedById: surveyor2Id,
    },
    { projectId: kavling.id, fromStatus: null, toStatus: "baru", changedById: adminId },
    {
      projectId: kavling.id,
      fromStatus: "baru",
      toStatus: "data_diambil",
      changedById: surveyor1Id,
    },
  ]);

  // Timeline fase demo (spec 2026-07-14) — di proyek "topografi" (PT Cahaya
  // Properti, TIDAK punya akun portal), sengaja BUKAN proyek "batas" milik
  // andi@klien.test: `e2e/project-phases.spec.ts` menambah fasenya sendiri ke
  // proyek "batas" lewat UI dan butuh proyek itu tanpa fase yang sudah ada.
  // Satu fase `selesai`, satu `berjalan` dengan target SUDAH LEWAT (demo
  // penanda "Telat"), satu `belum` dengan target di masa depan.
  await db.insert(projectPhases).values([
    {
      projectId: topografi.id,
      name: "Survei lapangan",
      sortOrder: 0,
      status: "selesai",
      weight: 2,
      assignedSurveyorId: surveyor2Id,
      targetDate: "2026-05-01",
      completedAt: new Date("2026-05-02T09:00:00Z"),
    },
    {
      projectId: topografi.id,
      name: "Pengolahan data & gambar",
      sortOrder: 1,
      status: "berjalan",
      weight: 2,
      assignedSurveyorId: surveyor2Id,
      targetDate: "2026-06-15", // sudah lewat dari hari ini (2026-07-15) -> "Telat"
      description: "Menunggu revisi poligon dari surveyor.",
    },
    {
      projectId: topografi.id,
      name: "Serah terima laporan",
      sortOrder: 2,
      status: "belum",
      weight: 1,
      targetDate: "2026-08-01",
    },
  ]);

  // Inventaris alat (spec 2026-07-14). Satu `perawatan`, satu `rusak`, sisanya
  // `tersedia` — semuanya dengan harga beli terisi supaya kolom admin-only
  // langsung terlihat di demo.
  const [totalStation1, totalStation2, gpsRtk, drone, waterpass] = await db
    .insert(equipment)
    .values([
      {
        name: "Total Station Topcon GM-52",
        category: "instrumen_ukur",
        serialNumber: "TS-GM52-001",
        condition: "tersedia",
        purchaseDate: "2024-03-10",
        purchasePrice: 85_000_000,
      },
      {
        name: "Total Station Sokkia CX-105",
        category: "instrumen_ukur",
        serialNumber: "TS-CX105-002",
        condition: "perawatan",
        notes: "Layar retak, dikirim servis ke pusat Sokkia.",
        purchaseDate: "2022-11-05",
        purchasePrice: 65_000_000,
      },
      {
        name: "GPS RTK Trimble R12",
        category: "gps_rtk",
        serialNumber: "RTK-R12-001",
        condition: "tersedia",
        purchaseDate: "2025-01-20",
        purchasePrice: 120_000_000,
      },
      {
        name: "Drone DJI Phantom 4 RTK",
        category: "drone",
        serialNumber: "DRN-P4RTK-001",
        condition: "rusak",
        notes: "Baling-baling patah, menunggu spare part.",
        purchaseDate: "2023-07-15",
        purchasePrice: 95_000_000,
      },
      {
        name: "Waterpass Sokkia B40A",
        category: "instrumen_ukur",
        serialNumber: "WP-B40A-001",
        condition: "tersedia",
        purchaseDate: "2021-09-01",
        purchasePrice: 12_000_000,
      },
    ])
    .returning();

  // Dua sesi pakai demo: satu MASIH BERJALAN (supaya status "Dipakai" kelihatan
  // langsung di demo tanpa perlu meminjam manual), satu sudah ditutup (supaya
  // durasi tertutup juga kelihatan di riwayat).
  await db.insert(equipmentUsage).values([
    {
      equipmentId: totalStation1.id,
      projectId: topografi.id,
      usedById: surveyor2Id,
      startedAt: new Date("2026-07-15T02:00:00Z"),
      endedAt: null,
      note: "Pengukuran ulang poligon tahap 2.",
      recordedById: surveyor2Id,
    },
    {
      equipmentId: waterpass.id,
      projectId: kavling.id,
      usedById: surveyor1Id,
      startedAt: new Date("2026-07-10T01:00:00Z"),
      endedAt: new Date("2026-07-10T05:30:00Z"),
      note: "Cek elevasi blok C.",
      recordedById: surveyor1Id,
    },
  ]);

  console.log("seed OK:", {
    users: 4,
    clients: 3,
    projects: inserted.length,
    statusLogs: 11,
    phases: 3,
    equipment: [totalStation1, totalStation2, gpsRtk, drone, waterpass].length,
  });
  process.exit(0);
}

seed().catch((e) => {
  console.error("seed FAILED:", e);
  process.exit(1);
});
