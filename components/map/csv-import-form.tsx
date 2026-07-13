"use client";

import { useAction } from "next-safe-action/hooks";
import { type ChangeEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { importMapCsv } from "@/lib/actions/maps";
import { formatArea } from "@/lib/geo/area";
import { importCsvToGeoJson } from "@/lib/geo/csv-import";
import {
  DEFAULT_UTM_HEMISPHERE,
  DEFAULT_UTM_ZONE,
  MAX_UTM_ZONE,
  MIN_UTM_ZONE,
} from "@/lib/geo/reproject";
import type { DetectedCoordinateFormat, UtmHemisphere } from "@/lib/geo/types";
import type { MapLayerRow } from "./peta-map";

const zoneOptions = Array.from(
  { length: MAX_UTM_ZONE - MIN_UTM_ZONE + 1 },
  (_, i) => MIN_UTM_ZONE + i,
);

/**
 * Import a coordinate CSV (Phase 5 brief): reads the file client-side, runs
 * it through the pure `lib/geo` modules to preview the detected format
 * (lat/long vs UTM) + area, lets the user override format/zone/hemisphere
 * before committing, then calls the `importMapCsv` server action with the
 * raw CSV text (small — well under the server-action body limit, unlike
 * document uploads).
 */
export function CsvImportForm({
  projectId,
  onImported,
}: {
  projectId: string;
  onImported: (layer: MapLayerRow) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [layerName, setLayerName] = useState("");
  const [formatOverride, setFormatOverride] = useState<DetectedCoordinateFormat | "auto">("auto");
  const [utmZone, setUtmZone] = useState(DEFAULT_UTM_ZONE);
  const [utmHemisphere, setUtmHemisphere] = useState<UtmHemisphere>(DEFAULT_UTM_HEMISPHERE);
  const [error, setError] = useState<string | null>(null);

  const { executeAsync, isExecuting } = useAction(importMapCsv);

  const preview = (() => {
    if (!csvText) return null;
    try {
      return importCsvToGeoJson(csvText, {
        formatOverride: formatOverride === "auto" ? undefined : formatOverride,
        utmZone,
        utmHemisphere,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Gagal membaca CSV." } as const;
    }
  })();

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    setLayerName((current) => current || file.name.replace(/\.csv$/i, ""));
    const text = await file.text();
    setCsvText(text);
  }

  async function handleImport() {
    if (!csvText) {
      setError("Pilih file CSV terlebih dahulu.");
      return;
    }
    if (!layerName.trim()) {
      setError("Nama layer wajib diisi.");
      return;
    }
    setError(null);
    try {
      const result = await executeAsync({
        projectId,
        name: layerName.trim(),
        csvText,
        formatOverride: formatOverride === "auto" ? undefined : formatOverride,
        utmZone,
        utmHemisphere,
      });
      if (result?.serverError) throw new Error(result.serverError);
      if (result?.validationErrors) throw new Error("Periksa kembali data CSV.");
      const layer = result?.data?.layer;
      if (!layer) throw new Error("Gagal mengimpor CSV.");
      setCsvText(null);
      setFileName("");
      setLayerName("");
      if (inputRef.current) inputRef.current.value = "";
      onImported({
        id: layer.id,
        name: layer.name,
        // biome-ignore lint/suspicious/noExplicitAny: jsonb column, shape validated at write time by maps-schemas.ts.
        geojson: layer.geojson as any,
        areaSqm: layer.areaSqm,
        source: layer.source,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengimpor CSV.");
    }
  }

  const isUtm = (preview && "format" in preview ? preview.format : formatOverride) === "utm";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="csv-file">Import CSV koordinat</Label>
        <Input
          id="csv-file"
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
        />
        <p className="text-xs text-muted-foreground">
          Kolom yang didukung: id/nama (opsional) + lat/long (WGS84) ATAU easting/northing (UTM).
        </p>
      </div>

      {fileName ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="layer-name">Nama layer</Label>
            <Input
              id="layer-name"
              value={layerName}
              onChange={(e) => setLayerName(e.target.value)}
            />
          </div>

          {preview && "error" in preview ? (
            <p className="text-xs text-destructive">{preview.error}</p>
          ) : preview ? (
            <div className="flex flex-col gap-2 rounded-md bg-muted p-3 text-xs">
              <p>{preview.reason}</p>
              <p>
                {preview.pointCount} titik terbaca
                {preview.errors.length > 0 ? `, ${preview.errors.length} baris error` : ""}.
              </p>
              {preview.areaSqm != null ? <p>Luas: {formatArea(preview.areaSqm).label}</p> : null}
              {preview.errors.length > 0 ? (
                <ul className="list-disc pl-4 text-destructive">
                  {preview.errors.slice(0, 5).map((e) => (
                    <li key={e.row}>{e.message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="format-override">Format koordinat</Label>
              <SelectField
                id="format-override"
                options={[
                  { value: "auto", label: "Otomatis (terdeteksi)" },
                  { value: "latlong", label: "Lintang/Bujur (WGS84)" },
                  { value: "utm", label: "UTM (easting/northing)" },
                ]}
                value={formatOverride}
                onValueChange={(value) =>
                  setFormatOverride(value as DetectedCoordinateFormat | "auto")
                }
              />
            </div>
            {isUtm ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="utm-zone">Zona UTM</Label>
                  {/* Zona UTM disimpan sebagai number, sementara <SelectField>
                      bekerja dengan string — konversinya di sini, bukan di
                      state, supaya `utmZone` tetap number bagi `importCsvToGeoJson`. */}
                  <SelectField
                    id="utm-zone"
                    options={zoneOptions.map((z) => ({ value: String(z), label: String(z) }))}
                    value={String(utmZone)}
                    onValueChange={(value) => setUtmZone(Number(value))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="utm-hemisphere">Belahan bumi</Label>
                  <SelectField
                    id="utm-hemisphere"
                    options={[
                      { value: "S", label: "Selatan (S)" },
                      { value: "N", label: "Utara (N)" },
                    ]}
                    value={utmHemisphere}
                    onValueChange={(value) => setUtmHemisphere(value as UtmHemisphere)}
                  />
                </div>
              </>
            ) : null}
            <Button type="button" onClick={handleImport} disabled={isExecuting}>
              {isExecuting ? "Mengimpor..." : "Import"}
            </Button>
          </div>
        </>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
