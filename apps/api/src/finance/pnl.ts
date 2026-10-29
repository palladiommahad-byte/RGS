import type { ExpenseCategory } from '@prisma/client';
import { margin, occupancyRate, type PeriodMetricsDto } from '@riad/shared';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type PnlRow = { label: string; values: (number | null)[]; kind: 'money' | 'percent'; strong?: boolean };
export type PnlTable = { months: string[]; rows: PnlRow[] };

type MonthInput = { month: string; metrics: PeriodMetricsDto; expensesByCategory: Map<string, number> };

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

/** Monthly P&L in French (the accountant's language), with a Total column. */
export function buildPnl(months: MonthInput[], categories: ExpenseCategory[]): PnlTable {
  const col = (pick: (m: MonthInput) => number) => {
    const values = months.map(pick);
    return [...values, sum(values)];
  };
  const used = categories.filter((c) => months.some((m) => (m.expensesByCategory.get(c.id) ?? 0) !== 0));
  const revenue = col((m) => m.metrics.revenue);
  const expenses = col((m) => m.metrics.expenses);
  const profit = col((m) => m.metrics.profit);
  const occupied = col((m) => m.metrics.occupiedNights);
  const available = col((m) => m.metrics.availableNights);
  return {
    months: [...months.map((m) => m.month), 'Total'],
    rows: [
      { label: 'Hébergement HT', values: col((m) => m.metrics.accommodationRevenue), kind: 'money' },
      { label: 'Extras HT', values: col((m) => m.metrics.extrasRevenue), kind: 'money' },
      { label: "Chiffre d'affaires HT", values: revenue, kind: 'money', strong: true },
      ...used.map((c) => ({ label: c.nameFr, values: col((m) => m.expensesByCategory.get(c.id) ?? 0), kind: 'money' as const })),
      { label: 'Total dépenses HT', values: expenses, kind: 'money', strong: true },
      { label: 'Résultat net', values: profit, kind: 'money', strong: true },
      { label: 'Marge', values: profit.map((p, i) => margin(p, revenue[i]!)), kind: 'percent' },
      { label: "Taux d'occupation", values: occupied.map((o, i) => occupancyRate(o, available[i]!)), kind: 'percent' },
    ],
  };
}

export async function pnlToXlsx(table: PnlTable, title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Riad Manager';
  const sheet = wb.addWorksheet('Compte de résultat', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  sheet.addRow([title]).font = { bold: true, size: 13 };
  const header = sheet.addRow(['', ...table.months]);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E48' } };
  for (const r of table.rows) {
    // Money in MAD (2 decimals) so the accountant can sum it; percentages as Excel %.
    const row = sheet.addRow([r.label, ...r.values.map((v) => (v === null ? null : r.kind === 'money' ? v / 100 : v))]);
    row.numFmt = r.kind === 'money' ? '#,##0.00' : '0.0%';
    if (r.strong) row.font = { bold: true };
  }
  sheet.getColumn(1).width = 28;
  for (let i = 2; i <= table.months.length + 1; i++) sheet.getColumn(i).width = 14;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, 'g');
const fmtMoney = (c: number) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(c / 100).replace(SPACES, ' ');
const fmtPct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')} %`;

export function pnlToPdf(table: PnlTable, title: string, riadName: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const left = 36;
  const width = doc.page.width - 72;
  const labelW = 150;
  const colW = (width - labelW) / table.months.length;

  doc.fillColor('#134e48').font('Helvetica-Bold').fontSize(16).text(riadName.replace(SPACES, ' '), left, 36);
  doc.fillColor('#14211f').font('Helvetica').fontSize(11).text(title);
  doc.fontSize(8).fillColor('#6a7b77').text('Montants HT en dirhams (MAD). À valider par votre comptable.');
  let y = doc.y + 12;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#134e48');
  table.months.forEach((m, i) => doc.text(m, left + labelW + i * colW, y, { width: colW - 4, align: 'right' }));
  y += 14;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#134e48').stroke();
  y += 4;
  for (const r of table.rows) {
    doc.font(r.strong ? 'Helvetica-Bold' : 'Helvetica').fillColor('#14211f').fontSize(8);
    doc.text(r.label, left, y, { width: labelW - 6 });
    r.values.forEach((v, i) =>
      doc.text(v === null ? '-' : r.kind === 'money' ? fmtMoney(v) : fmtPct(v), left + labelW + i * colW, y, {
        width: colW - 4,
        align: 'right',
      }),
    );
    y += 14;
    doc.moveTo(left, y - 3).lineTo(left + width, y - 3).strokeColor('#e3e9e7').lineWidth(0.5).stroke();
  }
  doc.end();
  return done;
}
