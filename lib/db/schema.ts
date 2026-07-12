import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums (PRD §5)                                                             */
/* -------------------------------------------------------------------------- */

export const userRole = pgEnum("user_role", ["owner", "surveyor", "client"]);
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
export const documentCategory = pgEnum("document_category", [
  "laporan",
  "berita_acara",
  "foto_lapangan",
  "sertifikat",
  "data_mentah",
  "lainnya",
]);
export const mapLayerSource = pgEnum("map_layer_source", ["manual", "import_csv", "import_dxf"]);

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
    // Keuangan ringan — owner-only (PRD Feature 5).
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
