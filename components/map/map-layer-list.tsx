"use client";

import { LayersIcon, Trash2Icon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteMapLayer } from "@/lib/actions/maps";
import { formatArea } from "@/lib/geo/area";
import type { MapLayerRow } from "./peta-map";

const sourceLabel: Record<string, string> = {
  manual: "Gambar manual",
  import_csv: "Import CSV",
  import_dxf: "Import DXF",
};

/**
 * Layer/version list for a project's Peta tab (brief: "A project can have
 * MULTIPLE map layers ... List them, toggle visibility, select one to
 * view/edit, delete one"). Visibility + selection are client-only UI state
 * (no `mapLayers.visible` column) lifted up from `peta-tab.tsx`.
 */
export function MapLayerList({
  layers,
  visibleLayerIds,
  onToggleVisible,
  onDeleted,
}: {
  layers: MapLayerRow[];
  visibleLayerIds: Set<string>;
  onToggleVisible: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const { executeAsync, isExecuting } = useAction(deleteMapLayer);

  async function handleDelete(id: string) {
    if (!confirm("Hapus layer peta ini?")) return;
    await executeAsync({ id });
    onDeleted(id);
  }

  if (layers.length === 0) {
    return (
      <EmptyState
        icon={LayersIcon}
        title="Belum ada layer peta"
        description="Gambar polygon/titik di peta atau import CSV koordinat untuk membuat layer pertama."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {layers.map((layer) => (
        <li
          key={layer.id}
          className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm"
        >
          <label className="flex flex-1 items-center gap-2">
            <input
              type="checkbox"
              checked={visibleLayerIds.has(layer.id)}
              onChange={() => onToggleVisible(layer.id)}
            />
            <span className="flex flex-col">
              <span className="font-medium">{layer.name}</span>
              <span className="text-xs text-muted-foreground">
                {sourceLabel[layer.source] ?? layer.source}
                {layer.areaSqm != null ? ` · ${formatArea(layer.areaSqm).label}` : ""}
              </span>
            </span>
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={isExecuting}
            onClick={() => handleDelete(layer.id)}
          >
            <Trash2Icon />
            <span className="sr-only">Hapus</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
