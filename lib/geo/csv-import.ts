import { calculateAreaSqm } from "./area";
import { parseCoordinateCsv } from "./csv-parse";
import { pointsToFeatureCollection } from "./geojson";
import { utmToWgs84 } from "./reproject";
import type { CsvRowError, DetectedCoordinateFormat, UtmHemisphere, WgsPoint } from "./types";

export type ImportCsvOptions = {
  /** Override the auto-detected format (user correction in the import UI). */
  formatOverride?: DetectedCoordinateFormat;
  /** Only used when the (effective) format is "utm". */
  utmZone?: number;
  utmHemisphere?: UtmHemisphere;
};

export type ImportCsvResult = {
  format: DetectedCoordinateFormat;
  reason: string;
  pointCount: number;
  errors: CsvRowError[];
  geojson: ReturnType<typeof pointsToFeatureCollection>;
  areaSqm: number | null;
};

/**
 * Orchestrates the pure geo modules: parse the CSV, detect/override the
 * coordinate format, reproject UTM rows to WGS84, build a GeoJSON
 * FeatureCollection (points + a closed polygon when there are >=3 points),
 * and compute its area. Malformed rows never throw — they're collected in
 * `errors` alongside whatever valid points were parsed.
 */
export function importCsvToGeoJson(
  rawCsv: string,
  options: ImportCsvOptions = {},
): ImportCsvResult {
  const parsed = parseCoordinateCsv(rawCsv, options.formatOverride);
  const zone = options.utmZone ?? 48;
  const hemisphere = options.utmHemisphere ?? "S";

  const wgsPoints: WgsPoint[] = [];
  const errors: CsvRowError[] = [...parsed.errors];

  for (const point of parsed.points) {
    if (parsed.format === "latlong") {
      wgsPoints.push({ id: point.id, lon: point.x, lat: point.y });
      continue;
    }
    try {
      const [lon, lat] = utmToWgs84(point.x, point.y, zone, hemisphere);
      wgsPoints.push({ id: point.id, lon, lat });
    } catch (error) {
      errors.push({
        row: point.rowNumber,
        message: `Baris ${point.rowNumber}: gagal reproyeksi UTM (${
          error instanceof Error ? error.message : "unknown error"
        }).`,
      });
    }
  }

  const geojson = pointsToFeatureCollection(wgsPoints);
  const areaSqm = calculateAreaSqm(geojson);

  return {
    format: parsed.format,
    reason: parsed.reason,
    pointCount: wgsPoints.length,
    errors,
    geojson,
    areaSqm,
  };
}
