"use client";

import { MapIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import type { MapLayerRow } from "./peta-map";

/**
 * Read-only map viewer for the client portal (PRD §3 Feature 6). Reuses
 * `PetaMap` — same rationale as `peta-tab.tsx` for the dynamic
 * `ssr: false` import — but passes `readOnly`, so no draw/edit toolbar is
 * ever mounted, and renders none of the save/import/layer-management UI
 * `PetaTab` has. Never fork `PetaMap` itself; this is the "add a read-only
 * prop" variant the phase-6/7 brief calls for.
 */
const PetaMap = dynamic(() => import("./peta-map").then((m) => m.PetaMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] w-full items-center justify-center rounded-lg border border-border bg-muted text-sm text-muted-foreground sm:h-[500px]">
      Memuat peta...
    </div>
  ),
});

export function PetaView({ layers }: { layers: MapLayerRow[] }) {
  const [visibleLayerIds] = useState<Set<string>>(() => new Set(layers.map((l) => l.id)));

  if (layers.length === 0) {
    return (
      <EmptyState
        icon={MapIcon}
        title="Belum ada data peta"
        description="Studio belum mengunggah data ukur untuk proyek ini."
      />
    );
  }

  return <PetaMap layers={layers} visibleLayerIds={visibleLayerIds} readOnly />;
}
