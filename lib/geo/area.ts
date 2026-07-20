import area from "@turf/area";
import type { Feature, FeatureCollection, Geometry } from "geojson";

const SQM_PER_HECTARE = 10_000;

function isPolygonal(geometry: Geometry): boolean {
  return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
}

/**
 * Total area (m²) of every polygon/multipolygon feature in a
 * FeatureCollection, using turf's geodesic area calculation. Returns null
 * when there is no polygon to measure (points-only collections).
 */
export function calculateAreaSqm(collection: FeatureCollection): number | null {
  const polygonFeatures = collection.features.filter(
    (f): f is Feature => f.geometry != null && isPolygonal(f.geometry),
  );
  if (polygonFeatures.length === 0) return null;

  const total = polygonFeatures.reduce((sum, feature) => sum + area(feature), 0);
  return total;
}

export type FormattedArea = {
  sqm: number;
  hectares: number;
  /** e.g. "10.041 m² (1,00 ha)" — Indonesian locale. */
  label: string;
};

/** Format an m² area for display, in BOTH m² and hectares (1 ha = 10 000 m²), id-ID locale. */
export function formatArea(sqm: number): FormattedArea {
  const hectares = sqm / SQM_PER_HECTARE;
  const sqmLabel = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(sqm);
  const haLabel = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(hectares);
  return {
    sqm,
    hectares,
    label: `${sqmLabel} m² (${haLabel} ha)`,
  };
}
