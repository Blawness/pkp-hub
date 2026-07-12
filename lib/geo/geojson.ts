import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import type { WgsPoint } from "./types";

/**
 * Build a GeoJSON FeatureCollection from imported points: one Point feature
 * per point, plus (when there are >=3 points) a closed Polygon feature so
 * area can be computed (brief: "render imported points AND close them into
 * a polygon when there are >=3 points").
 */
export function pointsToFeatureCollection(points: WgsPoint[]): FeatureCollection {
  const pointFeatures: Feature<Point>[] = points.map((p, index) => ({
    type: "Feature",
    properties: { id: p.id ?? `P${index + 1}`, pointIndex: index },
    geometry: { type: "Point", coordinates: [p.lon, p.lat] },
  }));

  const features: Feature[] = [...pointFeatures];

  if (points.length >= 3) {
    const ring = points.map((p) => [p.lon, p.lat] as [number, number]);
    const first = ring[0];
    const last = ring.at(-1);
    if (first && (!last || last[0] !== first[0] || last[1] !== first[1])) {
      ring.push(first);
    }
    const polygonFeature: Feature<Polygon> = {
      type: "Feature",
      properties: { kind: "imported-polygon" },
      geometry: { type: "Polygon", coordinates: [ring] },
    };
    features.push(polygonFeature);
  }

  return { type: "FeatureCollection", features };
}
