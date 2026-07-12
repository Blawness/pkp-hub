import { describe, expect, it } from "vitest";
import { importCsvToGeoJson } from "./csv-import";

describe("importCsvToGeoJson: lat/long CSV", () => {
  it("parses, builds a closed polygon (>=3 points), and computes area", () => {
    const csv = [
      "nama,lat,long",
      "A,-6.200000,106.800000",
      "B,-6.200000,106.801000",
      "C,-6.201000,106.801000",
      "D,-6.201000,106.800000",
    ].join("\n");

    const result = importCsvToGeoJson(csv);
    expect(result.format).toBe("latlong");
    expect(result.errors).toHaveLength(0);
    expect(result.pointCount).toBe(4);
    expect(result.geojson.features).toHaveLength(5); // 4 points + polygon
    expect(result.areaSqm).not.toBeNull();
    expect(result.areaSqm as number).toBeGreaterThan(0);
  });
});

describe("importCsvToGeoJson: UTM CSV with zone/hemisphere", () => {
  it("reprojects UTM zone 48S points and lands them in Indonesia's range", () => {
    const csv = [
      "id,easting,northing",
      "1,700000,9314000",
      "2,700100,9314000",
      "3,700100,9314100",
      "4,700000,9314100",
    ].join("\n");

    const result = importCsvToGeoJson(csv, { utmZone: 48, utmHemisphere: "S" });
    expect(result.format).toBe("utm");
    expect(result.errors).toHaveLength(0);
    expect(result.pointCount).toBe(4);

    for (const feature of result.geojson.features) {
      if (feature.geometry.type !== "Point") continue;
      const [lon, lat] = feature.geometry.coordinates;
      expect(lon).toBeGreaterThan(90);
      expect(lon).toBeLessThan(145);
      expect(lat).toBeGreaterThan(-12);
      expect(lat).toBeLessThan(8);
    }

    // Known ~100m x 100m square -> ~10,000 m^2 within 1%.
    expect(result.areaSqm as number).toBeGreaterThan(9900);
    expect(result.areaSqm as number).toBeLessThan(10100);
  });

  it("uses the default zone (48) and hemisphere (S) when not specified", () => {
    const csv = "id,easting,northing\n1,701000.72,9314342.70\n";
    const result = importCsvToGeoJson(csv);
    const [feature] = result.geojson.features;
    expect(feature.geometry.type).toBe("Point");
    if (feature.geometry.type === "Point") {
      const [lon, lat] = feature.geometry.coordinates;
      expect(lon).toBeCloseTo(106.8166, 3);
      expect(lat).toBeCloseTo(-6.2, 3);
    }
  });
});

describe("importCsvToGeoJson: malformed rows don't crash the import", () => {
  it("collects errors for bad rows and still imports the valid ones", () => {
    const csv = ["id,lat,long", "1,-6.2,106.8", "2,notanumber,106.9", "3,-6.3,"].join("\n");
    const result = importCsvToGeoJson(csv);
    expect(result.pointCount).toBe(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every((e) => e.message.length > 0)).toBe(true);
  });
});
