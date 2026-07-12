import { describe, expect, it } from "vitest";
import { isValidUtmZone, utmToWgs84 } from "./reproject";

/**
 * Fixed known values: UTM zone 48S easting/northing for a point near
 * Jakarta (lon 106.8166, lat -6.2), independently derived with proj4
 * (`proj4('WGS84', '+proj=utm +zone=48 +south +datum=WGS84 +units=m
 * +no_defs', [106.8166, -6.2])` => easting 701000.72, northing
 * 9314342.70). Asserts our reprojection lands back on that exact lon/lat
 * within a tight tolerance, and that the result is a plausible Indonesian
 * coordinate.
 */
describe("utmToWgs84", () => {
  it("reprojects a known UTM zone 48S point back to the expected WGS84 lon/lat", () => {
    const [lon, lat] = utmToWgs84(701000.7221901807, 9314342.696831143, 48, "S");
    expect(lon).toBeCloseTo(106.8166, 4);
    expect(lat).toBeCloseTo(-6.2, 4);
  });

  it("result lands within Indonesia's plausible lon/lat range", () => {
    const [lon, lat] = utmToWgs84(701000.72, 9314342.7, 48, "S");
    expect(lon).toBeGreaterThan(90);
    expect(lon).toBeLessThan(145);
    expect(lat).toBeGreaterThan(-12);
    expect(lat).toBeLessThan(8);
  });

  it("supports the Northern hemisphere too (e.g. northern Sumatra, zone 46N)", () => {
    // A point with a small northing (no +10,000,000 offset) in the North.
    const [lon, lat] = utmToWgs84(300000, 600000, 46, "N");
    expect(Number.isFinite(lon)).toBe(true);
    expect(Number.isFinite(lat)).toBe(true);
    expect(lat).toBeGreaterThan(0);
  });

  it("rejects a zone outside Indonesia's range (46-54)", () => {
    expect(() => utmToWgs84(500000, 9000000, 30, "S")).toThrow();
  });
});

describe("isValidUtmZone", () => {
  it("accepts 46-54", () => {
    expect(isValidUtmZone(46)).toBe(true);
    expect(isValidUtmZone(48)).toBe(true);
    expect(isValidUtmZone(54)).toBe(true);
  });

  it("rejects out-of-range or non-integer zones", () => {
    expect(isValidUtmZone(45)).toBe(false);
    expect(isValidUtmZone(55)).toBe(false);
    expect(isValidUtmZone(48.5)).toBe(false);
  });
});
