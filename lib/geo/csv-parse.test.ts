import { describe, expect, it } from "vitest";
import { detectColumns, parseCoordinateCsv } from "./csv-parse";

describe("parseCoordinateCsv: lat/long CSV", () => {
  it("parses a lat/long CSV into a FeatureCollection-ready point list", () => {
    const csv = "nama,lat,long\nP1,-6.200000,106.816600\nP2,-6.201000,106.817000\n";
    const result = parseCoordinateCsv(csv);
    expect(result.format).toBe("latlong");
    expect(result.errors).toHaveLength(0);
    expect(result.points).toEqual([
      { id: "P1", x: 106.8166, y: -6.2, rowNumber: 2 },
      { id: "P2", x: 106.817, y: -6.201, rowNumber: 3 },
    ]);
  });

  it("detects bare x/y columns as lat/long when values are in degree range", () => {
    const csv = "id,x,y\n1,106.8,-6.2\n";
    const result = parseCoordinateCsv(csv);
    expect(result.format).toBe("latlong");
    expect(result.points[0]).toEqual({ id: "1", x: 106.8, y: -6.2, rowNumber: 2 });
  });
});

describe("parseCoordinateCsv: UTM CSV", () => {
  it("parses a UTM easting/northing CSV, format detected as utm", () => {
    const csv = "id,easting,northing\nA,701000.72,9314342.70\nB,701100.72,9314442.70\n";
    const result = parseCoordinateCsv(csv);
    expect(result.format).toBe("utm");
    expect(result.errors).toHaveLength(0);
    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toEqual({ id: "A", x: 701000.72, y: 9314342.7, rowNumber: 2 });
  });

  it("detects bare x/y columns as UTM when values are metre-scale", () => {
    const csv = "id,x,y\n1,701000.72,9314342.70\n";
    const result = parseCoordinateCsv(csv);
    expect(result.format).toBe("utm");
  });

  it("respects an explicit formatOverride", () => {
    // Ambiguous-looking small numbers forced to be read as UTM anyway.
    const csv = "id,x,y\n1,100,50\n";
    const result = parseCoordinateCsv(csv, "utm");
    expect(result.format).toBe("utm");
    expect(result.points[0]).toEqual({ id: "1", x: 100, y: 50, rowNumber: 2 });
  });
});

describe("parseCoordinateCsv: malformed rows", () => {
  it("collects per-row errors instead of throwing, for non-numeric values", () => {
    const csv = "id,lat,long\nP1,-6.2,106.8\nP2,abc,106.9\nP3,-6.3,\n";
    const result = parseCoordinateCsv(csv);
    expect(result.points).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].row).toBe(3);
    expect(result.errors[1].row).toBe(4);
    expect(result.errors.every((e) => typeof e.message === "string" && e.message.length > 0)).toBe(
      true,
    );
  });

  it("collects an error for out-of-range lat/long values", () => {
    const csv = "id,lat,long\nP1,-200,106.8\n";
    const result = parseCoordinateCsv(csv);
    expect(result.points).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("throws a clear error when no coordinate columns can be detected at all", () => {
    const csv = "foo,bar\n1,2\n";
    expect(() => parseCoordinateCsv(csv)).toThrow(/kolom koordinat/i);
  });
});

describe("detectColumns", () => {
  it("prefers explicit lat/long headers over bare x/y", () => {
    const detection = detectColumns(["id", "lat", "long"], { id: "1", lat: "-6.2", long: "106.8" });
    expect(detection.format).toBe("latlong");
    expect(detection.xCol).toBe("long");
    expect(detection.yCol).toBe("lat");
  });

  it("prefers explicit easting/northing headers", () => {
    const detection = detectColumns(["id", "easting", "northing"], {
      id: "1",
      easting: "700000",
      northing: "9300000",
    });
    expect(detection.format).toBe("utm");
  });
});
