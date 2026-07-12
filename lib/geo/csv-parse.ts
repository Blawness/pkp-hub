import Papa from "papaparse";
import type {
  CsvRowError,
  DetectedCoordinateFormat,
  ParsedCoordinateCsv,
  RawCoordinatePoint,
} from "./types";

const ID_ALIASES = ["id", "nama", "name", "label", "titik", "point"];
const LAT_ALIASES = ["lat", "latitude"];
const LON_ALIASES = ["lon", "long", "lng", "longitude"];
const EASTING_ALIASES = ["easting"];
const NORTHING_ALIASES = ["northing"];
const X_ALIASES = ["x"];
const Y_ALIASES = ["y"];

function normalize(header: string): string {
  return header.trim().toLowerCase();
}

function findColumn(headers: string[], aliases: string[]): string | null {
  for (const h of headers) {
    if (aliases.includes(normalize(h))) return h;
  }
  return null;
}

export type ColumnDetection = {
  format: DetectedCoordinateFormat;
  /** Column holding lon (latlong) or easting (utm). */
  xCol: string;
  /** Column holding lat (latlong) or northing (utm). */
  yCol: string;
  idCol: string | null;
  reason: string;
};

/**
 * Detect which columns hold coordinates, and whether the file is lat/long
 * (WGS84 degrees) or UTM easting/northing (metres). Explicit column names
 * (lat/latitude + lon/long/lng/longitude, or easting + northing) win over
 * bare x/y, which are disambiguated by magnitude on the first numeric data
 * row: plausible degree values (|x|<=180, |y|<=90) => latlong, otherwise
 * treated as UTM metres (PRD/brief: superset support, auto-detect + let the
 * user override).
 */
export function detectColumns(
  headers: string[],
  firstDataRow: Record<string, string> | undefined,
): ColumnDetection {
  const idCol = findColumn(headers, ID_ALIASES);

  const latCol = findColumn(headers, LAT_ALIASES);
  const lonCol = findColumn(headers, LON_ALIASES);
  if (latCol && lonCol) {
    return {
      format: "latlong",
      xCol: lonCol,
      yCol: latCol,
      idCol,
      reason: `Kolom "${lonCol}"/"${latCol}" terdeteksi sebagai lintang/bujur (WGS84).`,
    };
  }

  const eastingCol = findColumn(headers, EASTING_ALIASES);
  const northingCol = findColumn(headers, NORTHING_ALIASES);
  if (eastingCol && northingCol) {
    return {
      format: "utm",
      xCol: eastingCol,
      yCol: northingCol,
      idCol,
      reason: `Kolom "${eastingCol}"/"${northingCol}" terdeteksi sebagai koordinat UTM (easting/northing).`,
    };
  }

  const xCol = findColumn(headers, X_ALIASES);
  const yCol = findColumn(headers, Y_ALIASES);
  if (xCol && yCol) {
    const xVal = firstDataRow ? Number.parseFloat(firstDataRow[xCol] ?? "") : Number.NaN;
    const yVal = firstDataRow ? Number.parseFloat(firstDataRow[yCol] ?? "") : Number.NaN;
    const looksLikeDegrees =
      Number.isFinite(xVal) &&
      Number.isFinite(yVal) &&
      Math.abs(xVal) <= 180 &&
      Math.abs(yVal) <= 90;
    if (looksLikeDegrees) {
      return {
        format: "latlong",
        xCol,
        yCol,
        idCol,
        reason: `Kolom "${xCol}"/"${yCol}" terdeteksi sebagai lintang/bujur berdasarkan nilai (dalam rentang derajat).`,
      };
    }
    return {
      format: "utm",
      xCol,
      yCol,
      idCol,
      reason: `Kolom "${xCol}"/"${yCol}" terdeteksi sebagai UTM easting/northing berdasarkan nilai (skala meter).`,
    };
  }

  throw new Error(
    'Tidak dapat mendeteksi kolom koordinat. Gunakan header "lat"/"long" (atau latitude/longitude) atau "easting"/"northing".',
  );
}

/**
 * Parse a coordinate CSV into raw (not-yet-reprojected) points, auto-
 * detecting lat/long vs UTM. `formatOverride` lets the caller (the import UI,
 * after showing the user what was detected) force the format instead of
 * relying on the magnitude heuristic. Malformed rows are collected as
 * `errors`, never thrown.
 */
export function parseCoordinateCsv(
  rawCsv: string,
  formatOverride?: DetectedCoordinateFormat,
): ParsedCoordinateCsv {
  const parsed = Papa.parse<Record<string, string>>(rawCsv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data;
  const detection = detectColumns(headers, rows[0]);
  const format = formatOverride ?? detection.format;

  const points: RawCoordinatePoint[] = [];
  const errors: CsvRowError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // 1-based, +1 for the header row
    const xRaw = row[detection.xCol];
    const yRaw = row[detection.yCol];

    if (xRaw === undefined || xRaw.trim() === "" || yRaw === undefined || yRaw.trim() === "") {
      errors.push({ row: rowNumber, message: `Baris ${rowNumber}: koordinat kosong.` });
      return;
    }

    const x = Number.parseFloat(xRaw);
    const y = Number.parseFloat(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      errors.push({
        row: rowNumber,
        message: `Baris ${rowNumber}: koordinat "${xRaw}, ${yRaw}" bukan angka valid.`,
      });
      return;
    }

    if (format === "latlong" && (Math.abs(x) > 180 || Math.abs(y) > 90)) {
      errors.push({
        row: rowNumber,
        message: `Baris ${rowNumber}: nilai lintang/bujur di luar rentang valid (${x}, ${y}).`,
      });
      return;
    }

    const idRaw = detection.idCol ? row[detection.idCol] : undefined;
    points.push({
      id: idRaw && idRaw.trim() !== "" ? idRaw.trim() : null,
      x,
      y,
      rowNumber,
    });
  });

  return { format, reason: detection.reason, points, errors };
}
