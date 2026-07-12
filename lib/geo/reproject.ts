import proj4 from "proj4";
import type { UtmHemisphere } from "./types";

/** Indonesia spans UTM zones 46N-54N / 46S-54S (mostly South) — PRD §10 / controller decision. */
export const MIN_UTM_ZONE = 46;
export const MAX_UTM_ZONE = 54;
export const DEFAULT_UTM_ZONE = 48;
export const DEFAULT_UTM_HEMISPHERE: UtmHemisphere = "S";

export function isValidUtmZone(zone: number): boolean {
  return Number.isInteger(zone) && zone >= MIN_UTM_ZONE && zone <= MAX_UTM_ZONE;
}

/** proj4 definition string for a given UTM zone + hemisphere, WGS84 datum. */
export function utmProjString(zone: number, hemisphere: UtmHemisphere): string {
  const south = hemisphere === "S" ? " +south" : "";
  return `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`;
}

/**
 * Reproject a single UTM easting/northing (metres) pair to WGS84 [lon, lat]
 * degrees, given the zone + hemisphere the CSV import UI lets the user pick
 * (default zone 48, South — most of Indonesia).
 */
export function utmToWgs84(
  easting: number,
  northing: number,
  zone: number,
  hemisphere: UtmHemisphere,
): [number, number] {
  if (!isValidUtmZone(zone)) {
    throw new Error(
      `Zona UTM ${zone} di luar rentang Indonesia (${MIN_UTM_ZONE}-${MAX_UTM_ZONE}).`,
    );
  }
  const [lon, lat] = proj4(utmProjString(zone, hemisphere), "WGS84", [easting, northing]);
  return [lon, lat];
}
