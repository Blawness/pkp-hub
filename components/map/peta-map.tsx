"use client";

import type { FeatureCollection } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import { useEffect } from "react";
import { GeoJSON, LayersControl, MapContainer, TileLayer, useMap } from "react-leaflet";

/**
 * The actual Leaflet map (Phase 5 brief). MUST only ever be loaded via
 * `next/dynamic({ ssr: false })` — see `peta-tab.tsx` — because Leaflet
 * touches `window` at import time and crashes during SSR.
 */

// Bundlers break Leaflet's default marker icon asset resolution; point it
// at the CDN build instead of trying to wire up bundler asset imports.
// biome-ignore lint/suspicious/noExplicitAny: Leaflet's own type doesn't expose this private field.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export type MapLayerRow = {
  id: string;
  name: string;
  geojson: FeatureCollection;
  areaSqm: number | null;
  source: string;
};

const DEFAULT_CENTER: [number, number] = [-6.2, 106.8166]; // Jakarta-ish fallback

/**
 * Attaches leaflet-draw's toolbar (polygon + marker only — brief only asks
 * for "polygons and points") to the map imperatively, since leaflet-draw is
 * a plain Leaflet plugin (not a React component). Reports every
 * create/edit/delete back as a GeoJSON FeatureCollection of everything
 * currently drawn.
 */
function DrawControl({ onDraftChange }: { onDraftChange: (fc: FeatureCollection | null) => void }) {
  const map = useMap();

  // biome-ignore lint/correctness/useExhaustiveDependencies: onDraftChange is expected to be stable-ish; re-running on every render would tear the toolbar down mid-draw.
  useEffect(() => {
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // biome-ignore lint/suspicious/noExplicitAny: leaflet-draw's types augment L.Control loosely.
    const DrawCtor = (L.Control as any).Draw;
    const drawControl = new DrawCtor({
      position: "topleft",
      draw: {
        polygon: { allowIntersection: false, showArea: true, metric: true },
        marker: true,
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
      },
      edit: { featureGroup: drawnItems },
    });
    map.addControl(drawControl);

    function report() {
      const fc = drawnItems.toGeoJSON() as FeatureCollection;
      onDraftChange(fc.features.length > 0 ? fc : null);
    }

    // biome-ignore lint/suspicious/noExplicitAny: leaflet-draw event payload shape.
    function handleCreated(e: any) {
      drawnItems.addLayer(e.layer);
      report();
    }

    // biome-ignore lint/suspicious/noExplicitAny: leaflet-draw's L.Draw.Event isn't in @types/leaflet-draw.
    const DrawEvent = (L as any).Draw.Event;
    map.on(DrawEvent.CREATED, handleCreated);
    map.on(DrawEvent.EDITED, report);
    map.on(DrawEvent.DELETED, report);

    return () => {
      map.off(DrawEvent.CREATED, handleCreated);
      map.off(DrawEvent.EDITED, report);
      map.off(DrawEvent.DELETED, report);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map]);

  return null;
}

export function PetaMap({
  layers,
  visibleLayerIds,
  onDraftChange,
  readOnly = false,
}: {
  layers: MapLayerRow[];
  visibleLayerIds: Set<string>;
  onDraftChange?: (fc: FeatureCollection | null) => void;
  /** Portal (client) view: no draw/edit toolbar at all. */
  readOnly?: boolean;
}) {
  const visible = layers.filter((l) => visibleLayerIds.has(l.id));
  const firstPoint = visible[0]?.geojson.features[0]?.geometry;
  const center: [number, number] =
    firstPoint?.type === "Point"
      ? [firstPoint.coordinates[1] as number, firstPoint.coordinates[0] as number]
      : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={16} style={{ height: "500px", width: "100%" }}>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="OpenStreetMap">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Citra Satelit (Esri)">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {visible.map((l) => (
        <GeoJSON key={l.id} data={l.geojson} />
      ))}

      {!readOnly && onDraftChange ? <DrawControl onDraftChange={onDraftChange} /> : null}
    </MapContainer>
  );
}
