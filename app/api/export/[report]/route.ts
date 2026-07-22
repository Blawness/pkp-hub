import { buildReportPdf } from "@/lib/export/pdf";
import { getReport } from "@/lib/export/reports/registry";
import { buildReportXlsx } from "@/lib/export/xlsx";
import { formatTanggalIndo } from "@/lib/format";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";

/**
 * Satu route untuk SEMUA laporan. GET `/api/export/<id>?format=pdf|xlsx&<filter>`.
 *
 * Keamanan: `getRbacContext()` DULU (butuh user login) — sebelum validasi
 * format maupun lookup registry — supaya penelepon anonim tidak bisa memetakan
 * id laporan yang ada dari beda 404/400. Lalu izin per-laporan dicek
 * (`can(ctx, def.permission)`). Data DIAMBIL ULANG di server via
 * `def.fetch(ctx, params)`; klien TIDAK pernah mengirim baris, jadi surveyor
 * tak bisa mengarang isi atau meminta data di luar scope-nya.
 *
 * Route handler (bukan server action): butuh nama file + streaming biner yang
 * benar tanpa akal-akalan di klien.
 */
export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const ctx = await getRbacContext();

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

  if (!can(ctx, def.permission)) {
    return new Response("Anda tidak punya izin untuk mengekspor laporan ini.", { status: 403 });
  }

  const { rows, filterLabel, footnote } = await def.fetch(ctx, url.searchParams);
  const columns = def.columns(ctx);

  const datePart = new Date().toISOString().slice(0, 10);
  const meta = {
    title: def.title,
    printedAt: formatTanggalIndo(datePart),
    filterLabel,
    footnote,
  };
  const filename = `${def.filename}-${datePart}`;

  // `Uint8Array` sah sebagai body di runtime, tapi `BodyInit` di lib TS yang
  // dipakai proyek ini belum memuatnya — cast, bukan menyalin ke Blob.
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
