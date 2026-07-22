import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mapLayers } from "@/lib/db/schema";
import { importCsvToGeoJson } from "@/lib/geo/csv-import";
import { assertCan } from "@/lib/rbac/can";
import type { ScopedPermission } from "@/lib/rbac/resources";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import type { RbacContext } from "@/lib/rbac/types";
import { storage } from "@/lib/storage";
import type { ImportMapCsvInput, SaveMapLayerInput } from "./maps-schemas";

/**
 * Server-only business logic for the Peta module (PRD §3 Feature 3), separated
 * from the "use server" wrappers in `maps.ts` so it's directly unit-testable
 * (see `maps.test.ts`). Setiap fungsi menegakkan izin sendiri lewat engine
 * RBAC — `assertCan(ctx, "map.write")` untuk gerbang aksi, `requireScopedRow`
 * untuk scope baris.
 *
 * CRITICAL: fungsi yang membaca/menulis peta proyek tertentu WAJIB lewat
 * `requireScopedRow` — bukan `db.select()` mentah pada `projects` — itulah batas
 * scoping baris (surveyor hanya proyek yang ditugaskan padanya, klien hanya
 * miliknya).
 */

/** Ubah sinyal 404 `notFound()` `requireScopedRow` jadi penolakan biasa. */
function isNotFoundDigest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

/** Verifikasi `ctx` boleh mengakses proyek ini; 404 → penolakan biasa. */
async function requireProjectReadOrReject(ctx: RbacContext, projectId: string) {
  try {
    return await requireScopedRow(ctx, "project.read", projectId);
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Project not found or you do not have access to it.");
    }
    throw error;
  }
}

/** Ambil satu layer yang boleh disentuh `ctx` untuk `permission`; 404 → penolakan. */
async function requireScopedLayerOrReject(
  ctx: RbacContext,
  permission: ScopedPermission,
  id: string,
): Promise<typeof mapLayers.$inferSelect> {
  try {
    return (await requireScopedRow(ctx, permission, id)) as typeof mapLayers.$inferSelect;
  } catch (error) {
    if (isNotFoundDigest(error)) throw new Error("Layer peta tidak ditemukan.");
    throw error;
  }
}

/** Admin + surveyor ber-akses (scope `map.write`), hanya untuk proyek yang boleh diakses. */
export async function saveMapLayerForUser(ctx: RbacContext, input: SaveMapLayerInput) {
  assertCan(ctx, "map.write");
  await requireProjectReadOrReject(ctx, input.projectId);

  const [layer] = await db
    .insert(mapLayers)
    .values({
      projectId: input.projectId,
      name: input.name,
      geojson: input.geojson,
      areaSqm: input.areaSqm ?? null,
      source: "manual",
      createdById: ctx.user.id,
    })
    .returning();
  return layer;
}

/**
 * Parses+reprojects the CSV (pure `lib/geo` modules), persists the raw file
 * via `lib/storage`, and inserts a `mapLayers` row with source
 * `import_csv`. Admin + surveyor ber-akses, hanya untuk proyek yang boleh diakses.
 */
export async function importMapCsvForUser(ctx: RbacContext, input: ImportMapCsvInput) {
  assertCan(ctx, "map.write");
  await requireProjectReadOrReject(ctx, input.projectId);

  const result = importCsvToGeoJson(input.csvText, {
    formatOverride: input.formatOverride,
    utmZone: input.utmZone,
    utmHemisphere: input.utmHemisphere,
  });

  if (result.pointCount === 0) {
    throw new Error("Tidak ada titik koordinat valid yang bisa diimpor dari file ini.");
  }

  const key = `map-layers/${input.projectId}/${crypto.randomUUID()}.csv`;
  const fileUrl = await storage.put(key, Buffer.from(input.csvText, "utf-8"), "text/csv");

  const [layer] = await db
    .insert(mapLayers)
    .values({
      projectId: input.projectId,
      name: input.name,
      geojson: result.geojson,
      areaSqm: result.areaSqm,
      source: "import_csv",
      rawFileUrl: fileUrl,
      createdById: ctx.user.id,
    })
    .returning();

  return {
    layer,
    format: result.format,
    reason: result.reason,
    errors: result.errors,
    pointCount: result.pointCount,
  };
}

/** Admin + surveyor ber-akses. Menghapus CSV mentah di storage juga, best-effort. */
export async function deleteMapLayerForUser(ctx: RbacContext, id: string) {
  assertCan(ctx, "map.write");
  const existing = await requireScopedLayerOrReject(ctx, "map.write", id);

  await db.delete(mapLayers).where(eq(mapLayers.id, id));
  if (existing.rawFileUrl) {
    try {
      await storage.delete(storage.keyFromUrl(existing.rawFileUrl));
    } catch {
      // Best-effort: metadata row is already gone.
    }
  }
  return existing;
}

/** Scoped list of map layers for a single project (used by the Peta tab), newest first. */
export async function listMapLayersForProject(ctx: RbacContext, projectId: string) {
  await requireProjectReadOrReject(ctx, projectId);
  return db
    .select()
    .from(mapLayers)
    .where(eq(mapLayers.projectId, projectId))
    .orderBy(desc(mapLayers.createdAt));
}
