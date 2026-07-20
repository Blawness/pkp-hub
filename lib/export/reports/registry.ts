import type { ReportDefinition } from "@/lib/export/types";
import { equipmentReport } from "@/lib/export/reports/equipment";

/**
 * Tempat tiap modul mendaftarkan laporannya. Menambah ekspor = satu file
 * deklarasi + satu baris di sini + pasang `<ExportButton report="..." />`.
 */
export const reportRegistry: Record<string, ReportDefinition<unknown>> = {
  equipment: equipmentReport as ReportDefinition<unknown>,
};

export function getReport(id: string): ReportDefinition<unknown> | undefined {
  return reportRegistry[id];
}
