"use client";

import type { FeatureCollection } from "geojson";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMapLayer } from "@/lib/actions/maps";
import { calculateAreaSqm, formatArea } from "@/lib/geo/area";
import { CsvImportForm } from "./csv-import-form";
import { MapLayerList } from "./map-layer-list";
import type { MapLayerRow } from "./peta-map";

/**
 * Leaflet MUST be loaded client-side only (Phase 5 brief: it touches
 * `window` at import time and crashes during SSR). `peta-tab.tsx` is
 * already a Client Component (required for `next/dynamic({ ssr: false })`
 * to be allowed at all — Next.js rejects that option from Server
 * Components), so the dynamic import lives here.
 */
const PetaMap = dynamic(() => import("./peta-map").then((m) => m.PetaMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] w-full items-center justify-center rounded-lg border border-border bg-muted text-sm text-muted-foreground sm:h-[500px]">
      Memuat peta...
    </div>
  ),
});

export function PetaTab({
  projectId,
  initialLayers,
}: {
  projectId: string;
  initialLayers: MapLayerRow[];
}) {
  const router = useRouter();
  const [layers, setLayers] = useState(initialLayers);
  const [visibleLayerIds, setVisibleLayerIds] = useState<Set<string>>(
    () => new Set(initialLayers.map((l) => l.id)),
  );
  const [draft, setDraft] = useState<FeatureCollection | null>(null);
  const [draftName, setDraftName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const { executeAsync: executeSave, isExecuting: isSaving } = useAction(saveMapLayer);

  const draftAreaSqm = draft ? calculateAreaSqm(draft) : null;

  function toggleVisible(id: string) {
    setVisibleLayerIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDeleted(id: string) {
    setLayers((current) => current.filter((l) => l.id !== id));
    setVisibleLayerIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function handleImported(layer: MapLayerRow) {
    setLayers((current) => [layer, ...current]);
    setVisibleLayerIds((current) => new Set(current).add(layer.id));
    // The server action already revalidated the path; also refresh so
    // other server-rendered data on this page (if any) stays in sync.
    router.refresh();
  }

  async function handleSaveDraft() {
    if (!draft) {
      setSaveError("Gambar polygon atau titik di peta terlebih dahulu.");
      return;
    }
    if (!draftName.trim()) {
      setSaveError("Nama layer wajib diisi.");
      return;
    }
    setSaveError(null);
    try {
      const result = await executeSave({
        projectId,
        name: draftName.trim(),
        geojson: draft,
        areaSqm: draftAreaSqm,
      });
      if (result?.serverError) throw new Error(result.serverError);
      if (result?.validationErrors) throw new Error("Periksa kembali data layer.");
      if (result?.data?.layer) {
        setLayers((current) => [result.data.layer as MapLayerRow, ...current]);
        setVisibleLayerIds((current) => new Set(current).add(result.data.layer.id));
      }
      setDraft(null);
      setDraftName("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Gagal menyimpan layer.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Peta</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <PetaMap layers={layers} visibleLayerIds={visibleLayerIds} onDraftChange={setDraft} />

          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="draft-name">Simpan gambar sebagai layer</Label>
              <Input
                id="draft-name"
                placeholder="mis. Batas lahan v1"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              />
            </div>
            {draftAreaSqm != null ? (
              <p className="text-sm text-muted-foreground">
                Luas: {formatArea(draftAreaSqm).label}
              </p>
            ) : null}
            <Button type="button" onClick={handleSaveDraft} disabled={isSaving || !draft}>
              {isSaving ? "Menyimpan..." : "Simpan layer"}
            </Button>
          </div>
          {saveError ? <p className="text-xs text-destructive">{saveError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import CSV</CardTitle>
        </CardHeader>
        <CardContent>
          <CsvImportForm projectId={projectId} onImported={handleImported} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Layer / versi</CardTitle>
        </CardHeader>
        <CardContent>
          <MapLayerList
            layers={layers}
            visibleLayerIds={visibleLayerIds}
            onToggleVisible={toggleVisible}
            onDeleted={handleDeleted}
          />
        </CardContent>
      </Card>
    </div>
  );
}
