import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatIDR, formatTanggalIndo } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/labels";
import { STUDIO } from "@/lib/studio-identity";
import { terbilangRupiah } from "@/lib/terbilang";

/**
 * Kwitansi PDF. MURNI: data masuk, byte keluar — tidak menyentuh DB maupun
 * storage, sehingga bisa diuji tanpa fixture apa pun (`template.test.ts`).
 *
 * `pdf-lib`, bukan `@react-pdf/renderer`: ia jalan mulus di runtime Node tanpa
 * konfigurasi bundler dan mengembalikan `Uint8Array` dari fungsi biasa.
 * Harganya tata letak manual (koordinat) — untuk SATU template, itu jauh lebih
 * murah daripada menyeret reconciler React ke dalam bundel server.
 */

export type ReceiptData = {
  receiptNumber: string;
  /** `YYYY-MM-DD` */
  paidAt: string;
  amount: number;
  method: "transfer" | "tunai" | "lainnya";
  note: string | null;
  clientName: string;
  projectTitle: string;
  surveyTypeLabel: string;
  projectValue: number;
  totalPaid: number;
  remaining: number;
  /** Non-null = kwitansi ini dibatalkan; PDF-nya membawa cap DIBATALKAN. */
  voidedReason: string | null;
};

const A5_LANDSCAPE: [number, number] = [595.28, 419.53];
const MARGIN = 40;

export async function buildReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A5_LANDSCAPE);
  const [width, height] = A5_LANDSCAPE;

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.04, 0.05, 0.08);
  const muted = rgb(0.45, 0.47, 0.52);
  const danger = rgb(0.8, 0.15, 0.15);

  const text = (
    value: string,
    x: number,
    y: number,
    opts: { size?: number; font?: typeof regular; color?: typeof ink } = {},
  ) => {
    page.drawText(value, {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? regular,
      color: opts.color ?? ink,
    });
  };

  // Kop
  let y = height - MARGIN;
  text(STUDIO.name, MARGIN, y, { size: 13, font: bold });
  y -= 14;
  text(STUDIO.address, MARGIN, y, { size: 8, color: muted });
  y -= 11;
  text(`${STUDIO.phone} · ${STUDIO.email}`, MARGIN, y, { size: 8, color: muted });

  y -= 16;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 1,
    color: muted,
  });

  // Judul
  y -= 28;
  text("K W I T A N S I", width / 2 - 45, y, { size: 14, font: bold });
  y -= 14;
  text(`No. ${data.receiptNumber}`, width / 2 - 45, y, { size: 9, color: muted });

  // Badan
  const labelX = MARGIN;
  const valueX = MARGIN + 120;
  const row = (label: string, value: string, font = regular) => {
    y -= 18;
    text(label, labelX, y, { size: 9, color: muted });
    text(":", valueX - 10, y, { size: 9, color: muted });
    text(value, valueX, y, { size: 10, font });
  };

  y -= 12;
  row("Telah terima dari", data.clientName, bold);
  row("Uang sejumlah", formatIDR(data.amount), bold);
  row("Terbilang", `## ${terbilangRupiah(data.amount)} ##`);
  row("Untuk pembayaran", `${data.projectTitle} (${data.surveyTypeLabel})`);
  if (data.note) row("Keterangan", data.note);
  row("Metode", paymentMethodLabel[data.method] ?? data.method);

  // Ringkasan posisi tagihan — supaya klien tidak perlu bertanya "sisa berapa?".
  y -= 22;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 0.5,
    color: muted,
  });
  y -= 16;
  text(`Nilai proyek: ${formatIDR(data.projectValue)}`, MARGIN, y, { size: 8, color: muted });
  text(`Total dibayar: ${formatIDR(data.totalPaid)}`, MARGIN + 170, y, { size: 8, color: muted });
  text(`Sisa: ${formatIDR(data.remaining)}`, MARGIN + 350, y, { size: 8, color: muted });

  // Tanda tangan
  const signX = width - MARGIN - 160;
  let signY = MARGIN + 78;
  text(`${STUDIO.city}, ${formatTanggalIndo(data.paidAt)}`, signX, signY, { size: 9 });
  signY -= 12;
  text("Penerima,", signX, signY, { size: 9, color: muted });
  signY -= 46;
  text(STUDIO.signerName, signX, signY, { size: 10, font: bold });
  signY -= 12;
  text(STUDIO.signerTitle, signX, signY, { size: 8, color: muted });

  // Cap batal — kwitansi yang dibatalkan harus MENGATAKAN dirinya batal, bukan
  // diam-diam hilang. Salinan yang terlanjur diunduh klien tidak bisa ditarik;
  // yang bisa kita jamin adalah unduhan berikutnya jujur.
  if (data.voidedReason) {
    page.drawText("DIBATALKAN", {
      x: 90,
      y: height / 2 - 20,
      size: 56,
      font: bold,
      color: danger,
      opacity: 0.25,
      rotate: { type: "degrees", angle: 18 } as never,
    });
    text(`Alasan pembatalan: ${data.voidedReason}`, MARGIN, MARGIN + 8, {
      size: 8,
      color: danger,
    });
  }

  return pdf.save();
}
