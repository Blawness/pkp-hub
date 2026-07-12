/**
 * Shared types for the pure geo modules (Phase 5 brief). These modules
 * contain ALL coordinate-system / CSV / area-calculation logic and are
 * unit-tested without a browser — the Leaflet React component itself is
 * not unit-tested, this math is.
 */

export type UtmHemisphere = "N" | "S";

export type DetectedCoordinateFormat = "latlong" | "utm";

/** One coordinate row before any reprojection. */
export type RawCoordinatePoint = {
  /** Optional id/nama column value for this point. */
  id: string | null;
  /** lon (latlong) or easting (utm). */
  x: number;
  /** lat (latlong) or northing (utm). */
  y: number;
  /** 1-based row number (header = row 1) for error messages. */
  rowNumber: number;
};

export type CsvRowError = {
  row: number;
  message: string;
};

export type ParsedCoordinateCsv = {
  format: DetectedCoordinateFormat;
  /** Human-readable explanation of why this format/columns were detected. */
  reason: string;
  points: RawCoordinatePoint[];
  errors: CsvRowError[];
};

/** A point already reprojected into WGS84 degrees, ready for GeoJSON. */
export type WgsPoint = {
  id: string | null;
  lon: number;
  lat: number;
};
