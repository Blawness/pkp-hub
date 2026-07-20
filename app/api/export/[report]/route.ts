import { requireStaff } from "@/lib/auth-guards";
import { buildReportPdf } from "@/lib/export/pdf";
import { getReport } from "@/lib/export/reports/registry";
import { buildReportXlsx } from "@/lib/export/xlsx";
import { formatTanggalIndo } from "@/lib/format";

/**
 * Satu route untuk SEMUA laporan. GET `/api/export/<id>?format=pdf|xlsx&<filter>`.
 *
 * Keamanan: `requireStaff()` dulu, lalu ambil definisi dari registry (404 kalau
 * id tak dikenal). Data DIAMBIL ULANG di server via `def.fetch(user, params)` —
 * klien TIDAK pernah mengirim baris, supaya surveyor tak bisa mengarang isi atau
 * meminta data di luar scope-nya.
 *
 * Route handler (bukan server action): butuh nama file + streaming biner yang
 * benar tanpa akal-akalan di klien.
 */
export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report: reportId } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "pdf";

  if (format !== "pdf" && format !== "xlsx") {
    return new Response("Format tidak didukung. Gunakan pdf atau xlsx.", { status: 400 });
  }

  const def = getReport(reportId);
  if (!def) {
    return new Response("Laporan tidak ditemukan.", { status: 404 });
  }

  const user = await requireStaff();

  const { rows, filterLabel, footnote } = await def.fetch(user, url.searchParams);
  const columns = def.columns(user);

  const printedAt = formatTanggalIndo(new Date().toISOString().slice(0, 10));
  const meta = {
    title: def.title,
    printedAt,
    filterLabel,
    footnote,
  };

  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `${def.filename}-${datePart}`;

  if (format === "pdf") {
    const bytes = await buildReportPdf({ title: def.title, columns }, rows, meta);
    return new Response(bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  }

  const bytes = await buildReportXlsx({ title: def.title, columns }, rows, meta);
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
