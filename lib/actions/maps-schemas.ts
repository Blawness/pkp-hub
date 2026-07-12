import type { FeatureCollection } from "geojson";
import { z } from "zod";
import {
  DEFAULT_UTM_HEMISPHERE,
  DEFAULT_UTM_ZONE,
  MAX_UTM_ZONE,
  MIN_UTM_ZONE,
} from "@/lib/geo/reproject";

/**
 * Shared zod schemas for the Peta module (Phase 5), mirroring
 * `documents-schemas.ts`'s split between plain schema definitions
 * (consumed by both `maps-logic.ts` and the "use server" wrappers in
 * `maps.ts`) and the actions themselves.
 */

function isFeatureCollection(value: unknown): value is FeatureCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((value as { features?: unknown }).features)
  );
}

/** A GeoJSON FeatureCollection, loosely validated (full validation happens client-side via turf/Leaflet). */
export const geojsonFeatureCollectionSchema = z.custom<FeatureCollection>(
  isFeatureCollection,
  "GeoJSON tidak valid (harus FeatureCollection).",
);

export const saveMapLayerInputSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "Nama layer wajib diisi."),
  geojson: geojsonFeatureCollectionSchema,
  areaSqm: z.number().nonnegative().nullable().optional(),
});
export type SaveMapLayerInput = z.infer<typeof saveMapLayerInputSchema>;

export const coordinateFormatSchema = z.enum(["latlong", "utm"]);

export const importMapCsvInputSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "Nama layer wajib diisi."),
  csvText: z.string().min(1, "File CSV kosong."),
  formatOverride: coordinateFormatSchema.optional(),
  utmZone: z.number().int().min(MIN_UTM_ZONE).max(MAX_UTM_ZONE).default(DEFAULT_UTM_ZONE),
  utmHemisphere: z.enum(["N", "S"]).default(DEFAULT_UTM_HEMISPHERE),
});
export type ImportMapCsvInput = z.infer<typeof importMapCsvInputSchema>;

export const deleteMapLayerInputSchema = z.object({ id: z.uuid() });
export type DeleteMapLayerInput = z.infer<typeof deleteMapLayerInputSchema>;
