import { describe, expect, it } from "vitest";
import { calculateAreaSqm, formatArea } from "./area";
import { pointsToFeatureCollection } from "./geojson";
import { utmToWgs84 } from "./reproject";
import type { WgsPoint } from "./types";

describe("pointsToFeatureCollection", () => {
  it("emits one Point feature per point and no polygon when there are <3 points", () => {
    const points: WgsPoint[] = [
      { id: "A", lon: 106.8, lat: -6.2 },
      { id: "B", lon: 106.81, lat: -6.21 },
    ];
    const fc = pointsToFeatureCollection(points);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);
    expect(fc.features.every((f) => f.geometry.type === "Point")).toBe(true);
  });

  it("closes >=3 points into an additional Polygon feature", () => {
    const points: WgsPoint[] = [
      { id: "A", lon: 106.8, lat: -6.2 },
      { id: "B", lon: 106.81, lat: -6.2 },
      { id: "C", lon: 106.81, lat: -6.21 },
    ];
    const fc = pointsToFeatureCollection(points);
    expect(fc.features).toHaveLength(4); // 3 points + 1 polygon
    const polygon = fc.features.find((f) => f.geometry.type === "Polygon");
    expect(polygon).toBeDefined();
    if (!polygon) throw new Error("expected a polygon feature");
    const ring = (polygon.geometry as { coordinates: number[][][] }).coordinates[0];
    expect(ring).toHaveLength(4); // 3 corners + closing point
    expect(ring[0]).toEqual(ring[3]);
  });
});

describe("calculateAreaSqm: known square", () => {
  it("computes area close to a known 100m x 100m UTM square (10,000 m^2)", () => {
    // Square defined in UTM zone 48S metres, reprojected to WGS84 so the
    // polygon closes exactly like a real imported CSV would.
    const utmCorners: [number, number][] = [
      [700000, 9314000],
      [700100, 9314000],
      [700100, 9314100],
      [700000, 9314100],
    ];
    const points: WgsPoint[] = utmCorners.map(([e, n], i) => {
      const [lon, lat] = utmToWgs84(e, n, 48, "S");
      return { id: `P${i + 1}`, lon, lat };
    });
    const fc = pointsToFeatureCollection(points);
    const area = calculateAreaSqm(fc);
    expect(area).not.toBeNull();
    // turf's geodesic area vs. the flat 10,000 m^2 UTM square: within 1%.
    expect(area as number).toBeGreaterThan(9900);
    expect(area as number).toBeLessThan(10100);
  });

  it("returns null when there is no polygon (points-only collection)", () => {
    const fc = pointsToFeatureCollection([
      { id: "A", lon: 106.8, lat: -6.2 },
      { id: "B", lon: 106.81, lat: -6.21 },
    ]);
    expect(calculateAreaSqm(fc)).toBeNull();
  });
});

describe("formatArea", () => {
  it("formats m^2 and hectares (1 ha = 10,000 m^2) in Indonesian locale", () => {
    const formatted = formatArea(10_000);
    expect(formatted.sqm).toBe(10_000);
    expect(formatted.hectares).toBe(1);
    expect(formatted.label).toContain("m²");
    expect(formatted.label).toContain("ha");
  });

  it("hectares scale correctly for a non-round area", () => {
    const formatted = formatArea(25_000);
    expect(formatted.hectares).toBe(2.5);
  });
});
