import { desc, eq } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { mapLayers } from "@/lib/db/schema";
import { importCsvToGeoJson } from "@/lib/geo/csv-import";
import { storage } from "@/lib/storage";
import type { ImportMapCsvInput, SaveMapLayerInput } from "./maps-schemas";

/**
 * Server-only business logic for the Peta module (Phase 5), separated from
 * the "use server" wrappers in `maps.ts` so it's directly unit-testable
 * (see `maps.test.ts`). Every function re-checks the caller's role/scoping
 * itself — defense in depth alongside `staffActionClient` /
 * `ownerActionClient` in `maps.ts`, not a replacement for it.
 *
 * CRITICAL: any function that reads/writes a specific project's map layers
 * MUST go through `assertProjectAccess` — never a raw `db.select()` on
 * `projects`. Same row-level scoping boundary as `documents-logic.ts` and
 * `projects-logic.ts`.
 */

function requireStaff(user: SessionUser) {
  if (user.role !== "owner" && user.role !== "surveyor") {
    throw new Error("You do not have permission to perform this action.");
  }
}

/**
 * `notFound()`'s digest for this Next.js version — same rationale as
 * `documents-logic.ts#isNotFoundDigest`: translate `assertProjectAccess`'s
 * 404 signal into a plain rejection instead of letting it escape a server
 * action or a directly-unit-tested function.
 */
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

/** Owner + surveyor, and only for a project they can access. */
export async function saveMapLayerForUser(user: SessionUser, input: SaveMapLayerInput) {
  requireStaff(user);
  await assertProjectAccessOrReject(input.projectId, user);

  const [layer] = await db
    .insert(mapLayers)
    .values({
      projectId: input.projectId,
      name: input.name,
      geojson: input.geojson,
      areaSqm: input.areaSqm ?? null,
      source: "manual",
      createdById: user.id,
    })
    .returning();
  return layer;
}

/**
 * Parses+reprojects the CSV (pure `lib/geo` modules), persists the raw file
 * via `lib/storage`, and inserts a `mapLayers` row with source
 * `import_csv`. Owner + surveyor, only for a project they can access.
 */
export async function importMapCsvForUser(user: SessionUser, input: ImportMapCsvInput) {
  requireStaff(user);
  await assertProjectAccessOrReject(input.projectId, user);

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
      createdById: user.id,
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

/** Owner + surveyor, only for a project they can access. Deletes the raw CSV in storage too, best-effort. */
export async function deleteMapLayerForUser(user: SessionUser, id: string) {
  requireStaff(user);
  const [existing] = await db.select().from(mapLayers).where(eq(mapLayers.id, id));
  if (!existing) throw new Error("Layer peta tidak ditemukan.");
  await assertProjectAccessOrReject(existing.projectId, user);

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
export async function listMapLayersForProject(user: SessionUser, projectId: string) {
  await assertProjectAccessOrReject(projectId, user);
  return db
    .select()
    .from(mapLayers)
    .where(eq(mapLayers.projectId, projectId))
    .orderBy(desc(mapLayers.createdAt));
}
