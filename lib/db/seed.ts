import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "./index";
import {
  accounts,
  clients,
  documents,
  mapLayers,
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
 */
async function seed() {
  // FK-safe teardown so the seed is re-runnable.
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(sessions);
  await db.delete(accounts);
  await db.delete(users);

  const ownerId = randomUUID();
  const surveyor1Id = randomUUID();
  const surveyor2Id = randomUUID();
  const clientUserId = randomUUID();

  await db.insert(users).values([
    { id: ownerId, name: "Yudha Pratama", email: "owner@pkp.test", role: "owner" },
    { id: surveyor1Id, name: "Bagas Nugroho", email: "bagas@pkp.test", role: "surveyor" },
    { id: surveyor2Id, name: "Rizky Ananda", email: "rizky@pkp.test", role: "surveyor" },
    { id: clientUserId, name: "Andi Wijaya", email: "andi@klien.test", role: "client" },
  ]);

  const hashedPassword = await hashPassword(SEED_PASSWORD);
  await db.insert(accounts).values(
    [ownerId, surveyor1Id, surveyor2Id, clientUserId].map((userId) => ({
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
  await db.insert(projectStatusLogs).values([
    { projectId: batas.id, fromStatus: null, toStatus: "baru", changedById: ownerId },
    { projectId: batas.id, fromStatus: "baru", toStatus: "dijadwalkan", changedById: ownerId },
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
    { projectId: batas.id, fromStatus: "diproses", toStatus: "selesai", changedById: ownerId },
    { projectId: topografi.id, fromStatus: null, toStatus: "baru", changedById: ownerId },
    {
      projectId: topografi.id,
      fromStatus: "baru",
      toStatus: "dijadwalkan",
      changedById: ownerId,
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
    { projectId: kavling.id, fromStatus: null, toStatus: "baru", changedById: ownerId },
    {
      projectId: kavling.id,
      fromStatus: "baru",
      toStatus: "data_diambil",
      changedById: surveyor1Id,
    },
  ]);

  console.log("seed OK:", {
    users: 4,
    clients: 3,
    projects: inserted.length,
    statusLogs: 11,
  });
  process.exit(0);
}

seed().catch((e) => {
  console.error("seed FAILED:", e);
  process.exit(1);
});
