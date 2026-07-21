import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums (PRD §5)                                                             */
/* -------------------------------------------------------------------------- */

export const userRole = pgEnum("user_role", ["admin", "surveyor", "client"]);
export const clientType = pgEnum("client_type", ["individual", "company"]);
export const projectStatus = pgEnum("project_status", [
  "baru",
  "dijadwalkan",
  "data_diambil",
  "diproses",
  "selesai",
  "dibatalkan",
]);
export const surveyType = pgEnum("survey_type", [
  "topografi",
  "kavling",
  "batas_tanah",
  "luas_bangunan",
  "lainnya",
]);
export const paymentStatus = pgEnum("payment_status", ["belum", "sebagian", "lunas"]);
export const paymentMethod = pgEnum("payment_method", ["transfer", "tunai", "lainnya"]);
export const documentCategory = pgEnum("document_category", [
  "laporan",
  "berita_acara",
  "foto_lapangan",
  "sertifikat",
  "data_mentah",
  "lainnya",
]);
export const mapLayerSource = pgEnum("map_layer_source", ["manual", "import_csv", "import_dxf"]);
export const projectPhaseStatus = pgEnum("project_phase_status", ["belum", "berjalan", "selesai"]);
export const equipmentCategory = pgEnum("equipment_category", [
  "instrumen_ukur",
  "gps_rtk",
  "drone",
  "aksesoris_survey",
  "laptop",
  "inventaris_kantor",
  "lainnya",
]);
export const equipmentCondition = pgEnum("equipment_condition", [
  "tersedia",
  "perawatan",
  "rusak",
  "pensiun",
]);

/* RBAC (spec 2026-07-21). `permission` sengaja BUKAN pgEnum — katalognya hidup
 * di lib/rbac/resources/, jadi menambah fitur tidak boleh butuh migrasi DB. */
export const roleArea = pgEnum("role_area", ["staff", "client"]);
export const permissionScope = pgEnum("permission_scope", ["all", "assigned", "own"]);

/* -------------------------------------------------------------------------- */
/* Better Auth core tables (wired up in Phase 2) + `role`                     */
/* -------------------------------------------------------------------------- */

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("client"),
  // Soft delete. Baris user TIDAK pernah dihapus: projects.assignedSurveyorId,
  // documents.uploadedById, dan projectStatusLogs menunjuk ke sini lewat FK,
  // jadi DELETE akan gagal — atau, kalau dipaksa cascade, ikut menghapus
  // riwayat pekerjaan orang tersebut. Mengarsipkan mencabut aksesnya tanpa
  // merusak jejak siapa mengerjakan apa.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* Domain tables (PRD §5)                                                     */
/* -------------------------------------------------------------------------- */

export const clients = pgTable(
  "client",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: clientType("type").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    notes: text("notes"),
    // Portal account, optional per client (PRD §10).
    userId: text("user_id")
      .unique()
      .references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("client_archived_at_idx").on(t.archivedAt)],
);

export const projects = pgTable(
  "project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    surveyType: surveyType("survey_type").notNull(),
    locationLabel: text("location_label"),
    assignedSurveyorId: text("assigned_surveyor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: projectStatus("status").notNull().default("baru"),
    orderDate: timestamp("order_date", { withTimezone: true }).notNull().defaultNow(),
    description: text("description"),
    // Keuangan ringan — admin-only (PRD Feature 5).
    projectValue: bigint("project_value", { mode: "number" }),
    paymentStatus: paymentStatus("payment_status").notNull().default("belum"),
    paymentNotes: text("payment_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("project_client_id_idx").on(t.clientId),
    index("project_assigned_surveyor_id_idx").on(t.assignedSurveyorId),
    index("project_status_idx").on(t.status),
  ],
);

export const projectStatusLogs = pgTable(
  "project_status_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fromStatus: projectStatus("from_status"),
    toStatus: projectStatus("to_status").notNull(),
    changedById: text("changed_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_status_log_project_id_idx").on(t.projectId)],
);

export const mapLayers = pgTable(
  "map_layer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // GeoJSON FeatureCollection — jsonb, not PostGIS (PRD §10 decision).
    geojson: jsonb("geojson").notNull(),
    areaSqm: doublePrecision("area_sqm"),
    source: mapLayerSource("source").notNull(),
    rawFileUrl: text("raw_file_url"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("map_layer_project_id_idx").on(t.projectId)],
);

export const documents = pgTable(
  "document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: documentCategory("category").notNull(),
    fileUrl: text("file_url").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    mimeType: text("mime_type").notNull(),
    sharedWithClient: boolean("shared_with_client").notNull().default(false),
    uploadedById: text("uploaded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_project_id_idx").on(t.projectId),
    index("document_category_idx").on(t.category),
  ],
);

/**
 * Fase pekerjaan per proyek (spec 2026-07-14). Melengkapi `projects.status`,
 * BUKAN menggantikannya: status pipeline tetap ringkasan kasar yang dipakai
 * filter, papan, dan notifikasi.
 *
 * `completedAt` diisi/dikosongkan OTOMATIS oleh transisi status (lihat
 * `phases-logic.ts`) — tidak pernah diketik manusia. Tanggal selesai yang bisa
 * diketik akan berbeda dari statusnya, dan salah satunya pasti bohong.
 *
 * Persen progres TIDAK disimpan di sini: ia diturunkan dari `weight` +
 * `status` (`lib/phases/derive.ts`), pelajaran yang sama dengan
 * `paymentStatus` di Phase 12.
 */
export const projectPhases = pgTable(
  "project_phase",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Catatan INTERNAL — tidak pernah dikirim ke klien (dipangkas di query portal).
    description: text("description"),
    sortOrder: integer("sort_order").notNull(),
    status: projectPhaseStatus("status").notNull().default("belum"),
    // Bobot progres. Default 1 = semua fase setara, sehingga studio yang tidak
    // peduli bobot tetap dapat persen yang masuk akal tanpa isian tambahan.
    weight: integer("weight").notNull().default(1),
    assignedSurveyorId: text("assigned_surveyor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Tanggal KALENDER, mode string (`YYYY-MM-DD`) — alasan sama dengan
    // `payment.paidAt`: `Date` di server ber-offset negatif bisa menggesernya sehari.
    targetDate: date("target_date", { mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("project_phase_project_id_idx").on(t.projectId),
    index("project_phase_assigned_surveyor_id_idx").on(t.assignedSurveyorId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ one, many }) => ({
  clientProfile: one(clients, { fields: [users.id], references: [clients.userId] }),
  assignedProjects: many(projects),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  portalUser: one(users, { fields: [clients.userId], references: [users.id] }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  assignedSurveyor: one(users, {
    fields: [projects.assignedSurveyorId],
    references: [users.id],
  }),
  statusLogs: many(projectStatusLogs),
  mapLayers: many(mapLayers),
  documents: many(documents),
  payments: many(payments),
  phases: many(projectPhases),
}));

export const projectStatusLogsRelations = relations(projectStatusLogs, ({ one }) => ({
  project: one(projects, { fields: [projectStatusLogs.projectId], references: [projects.id] }),
  changedBy: one(users, { fields: [projectStatusLogs.changedById], references: [users.id] }),
}));

export const mapLayersRelations = relations(mapLayers, ({ one }) => ({
  project: one(projects, { fields: [mapLayers.projectId], references: [projects.id] }),
  createdBy: one(users, { fields: [mapLayers.createdById], references: [users.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  project: one(projects, { fields: [documents.projectId], references: [projects.id] }),
  uploadedBy: one(users, { fields: [documents.uploadedById], references: [users.id] }),
}));

export const projectPhasesRelations = relations(projectPhases, ({ one }) => ({
  project: one(projects, { fields: [projectPhases.projectId], references: [projects.id] }),
  assignedSurveyor: one(users, {
    fields: [projectPhases.assignedSurveyorId],
    references: [users.id],
  }),
}));

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

/**
 * Inventaris alat (spec 2026-07-14). SATU BARIS = SATU UNIT FISIK — dua total
 * station sejenis adalah dua baris. Hanya dengan begitu sistem bisa menjamin
 * satu alat dipegang satu orang, dan riwayat pakai menempel ke unit yang benar.
 *
 * Alat TIDAK PERNAH dihapus permanen, hanya diarsipkan (`archivedAt`): baris
 * `equipment_usage` menunjuk ke sini lewat FK, jadi DELETE akan gagal — atau,
 * kalau dipaksa cascade, ikut menghapus jejak siapa pernah memegang apa.
 * Alasan yang sama dengan `users.archivedAt`.
 *
 * `condition` TERPISAH dari status pinjam. Alat rusak bukan "sedang dipakai"
 * dan bukan "tersedia"; tanpa kolom ini, satu-satunya cara menandainya adalah
 * menghapusnya.
 */
/**
 * Jenis alat (spec 2026-07-16) — "GPS RTK Trimble R8", bukan unit fisiknya.
 * Field yang sama untuk semua unit sejenis (nama, kategori, gambar) tinggal
 * di sini; yang beda per unit fisik (kode, kondisi, data pembelian) tinggal
 * di `equipment`. Memisahkan keduanya memungkinkan daftar alat menunjukkan
 * "5 total, 3 tersedia, 2 dipinjam" per jenis tanpa kehilangan identitas
 * unit fisik mana yang sedang di tangan siapa — `equipment` tetap satu baris
 * = satu unit fisik, invarian yang sama dengan spec 2026-07-14.
 *
 * TIDAK ADA `archivedAt` di sini dengan sengaja: arsip tetap per UNIT
 * (`equipment.archivedAt`), bukan per jenis — mengarsipkan satu jenis alat
 * sekaligus bukan cakupan fitur ini (lihat spec §Ruang lingkup).
 */
export const equipmentItem = pgTable("equipment_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: equipmentCategory("category").notNull(),
  image: text("image"),
  // Soft delete, alasan sama dengan `equipment`: `equipment.itemId` menunjuk ke
  // sini dengan `onDelete: "restrict"`, dan riwayat pakai unit lama harus tetap
  // bisa menyebut nama jenisnya. Diarsipkan hanya kalau semua unitnya sudah
  // diarsipkan lebih dulu (`equipment-items-logic.ts`).
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => equipmentItem.id, { onDelete: "restrict" }),
    // Kode inventaris studio — BUKAN serialNumber (nomor seri pabrik di bawah,
    // opsional & tidak dijamin unik). `code` dikontrol studio sendiri, wajib,
    // unik, dipakai untuk saling merujuk di lapangan/laporan.
    code: text("code").notNull(),
    serialNumber: text("serial_number"),
    condition: equipmentCondition("condition").notNull().default("tersedia"),
    // ADMIN-ONLY. Dipangkas di level query untuk surveyor (equipment-logic.ts).
    purchaseDate: date("purchase_date", { mode: "string" }),
    purchasePrice: bigint("purchase_price", { mode: "number" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("equipment_item_id_idx").on(t.itemId),
    index("equipment_condition_idx").on(t.condition),
    index("equipment_archived_at_idx").on(t.archivedAt),
    uniqueIndex("equipment_code_uniq").on(t.code),
  ],
);

/**
 * Sesi pakai. `endedAt` NULL = SEDANG DIPAKAI — status pakai adalah turunan dari
 * adanya sesi terbuka, bukan dropdown terpisah (pelajaran `paymentStatus`
 * Phase 12). Durasi juga tidak disimpan: ia `endedAt − startedAt`, supaya
 * mengoreksi jam mulai tidak meninggalkan durasi lama yang sudah jadi bohong.
 *
 * `usedById` (yang MEMEGANG) sengaja dipisah dari `recordedById` (yang
 * MENGINPUT): admin sering mencatat dari kantor untuk surveyor di lapangan.
 * Menggabungkannya membuat riwayat mencatat admin sebagai pemegang alat yang
 * tidak pernah ia sentuh.
 */
export const equipmentUsage = pgTable(
  "equipment_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    usedById: text("used_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    note: text("note"),
    recordedById: text("recorded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("equipment_usage_equipment_id_idx").on(t.equipmentId),
    index("equipment_usage_project_id_idx").on(t.projectId),
    /**
     * PERTAHANAN SUNGGUHAN terhadap sesi ganda. Kalau hanya dicek di kode
     * ("apakah ada sesi terbuka?" lalu insert), dua surveyor yang menekan
     * "Pakai" hampir bersamaan bisa DUA-DUANYA lolos pengecekan sebelum salah
     * satunya menulis — dan alat tercatat di dua tangan. Pengecekan di kode
     * hanya untuk memberi pesan error yang enak dibaca; INI yang menegakkan.
     */
    uniqueIndex("equipment_active_usage_uniq").on(t.equipmentId).where(sql`${t.endedAt} is null`),
  ],
);

export const equipmentItemRelations = relations(equipmentItem, ({ many }) => ({
  units: many(equipment),
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
  item: one(equipmentItem, { fields: [equipment.itemId], references: [equipmentItem.id] }),
  usages: many(equipmentUsage),
}));

export const equipmentUsageRelations = relations(equipmentUsage, ({ one }) => ({
  equipment: one(equipment, {
    fields: [equipmentUsage.equipmentId],
    references: [equipment.id],
  }),
  project: one(projects, { fields: [equipmentUsage.projectId], references: [projects.id] }),
  usedBy: one(users, { fields: [equipmentUsage.usedById], references: [users.id] }),
  recordedBy: one(users, { fields: [equipmentUsage.recordedById], references: [users.id] }),
}));

/* -------------------------------------------------------------------------- */
/* Audit log                                                                  */
/* -------------------------------------------------------------------------- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detail: jsonb("detail"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_actor_id_idx").on(t.actorId),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* RBAC (spec 2026-07-21)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Role = baris DB, bukan enum. Tiga role bawaan di-seed dengan `isSystem`
 * true dan tidak boleh dihapus — `proxy.ts` dan area /portal bergantung
 * padanya. Role tidak di-soft-delete (beda dengan users/clients/equipment)
 * karena tidak ada FK riwayat yang menunjuk ke sini.
 */
export const roles = pgTable("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  // Menentukan area landing (/dashboard vs /portal). `users.role` tetap ada
  // sebagai petunjuk kasar untuk proxy.ts, yang tidak boleh query DB.
  area: roleArea("area").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Satu grant = satu izin + jangkauan barisnya. */
export const rolePermissions = pgTable(
  "role_permission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    scope: permissionScope("scope").notNull().default("own"),
  },
  (t) => [uniqueIndex("role_permission_uniq").on(t.roleId, t.permission)],
);

/**
 * Multi-role: izin efektif user = gabungan seluruh role-nya.
 *
 * Nama fisiknya `user_role_assignment`, bukan `user_role`: Postgres menaruh
 * tabel dan tipe di namespace yang sama, dan `user_role` sudah dipakai enum
 * `userRole` milik kolom `user.role`.
 */
export const userRoles = pgTable(
  "user_role_assignment",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));
