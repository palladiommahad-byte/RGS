import { Injectable } from '@nestjs/common';
import type { Invoice, Payment, Riad } from '@prisma/client';
import type { BillLine, PaymentMethod } from '@riad/shared';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { madInWords } from './amount-in-words';
import type { InvoiceBreakdown } from './invoice-breakdown';

const TEAL = '#134e48';
const MUTED = '#6a7b77';
const LINE = '#e3e9e7';

// The built-in PDF fonts are Latin-1: swap no-break spaces (used by Intl in fr) for spaces.
const SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, 'g');
const clean = (s: string) => s.replace(SPACES, ' ');

const money = (centimes: number) =>
  clean(
    `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(centimes / 100)} MAD`,
  );
const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const pct = (bp: number) => `${(bp / 100).toLocaleString('fr-FR')} %`;

const METHOD: Record<PaymentMethod, string> = {
  CASH: 'Espèces',
  CARD: 'Carte bancaire',
  TRANSFER: 'Virement',
  OTA_COLLECTED: 'Encaissé par la plateforme',
};

const EXTRA_CATEGORY: Record<string, string> = {
  FOOD: 'Restauration',
  HAMMAM: 'Hammam & soins',
  TRANSFER: 'Transfert',
  EXCURSION: 'Excursion',
  OTHER: 'Divers',
};

function lineLabel(l: BillLine, b: InvoiceBreakdown): string {
  switch (l.kind) {
    case 'ACCOMMODATION':
      return `Hébergement${b.stay.roomName ? ` - ${b.stay.roomName}` : ''} (${day(b.stay.checkInDate)} au ${day(b.stay.checkOutDate)})`;
    case 'TAXE_SEJOUR':
      return `Taxe de séjour (${l.quantity} nuitées adultes)`;
    case 'TPT':
      return `Taxe de promotion touristique (${l.quantity} nuitées adultes)`;
    default:
      return `${l.label}${l.category ? ` (${EXTRA_CATEGORY[l.category] ?? l.category})` : ''}`;
  }
}

/** A4 invoice in French (the accounting language in Morocco), from the frozen snapshot. */
@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Renders and stores the PDF, returns its storage key. */
  async generate(invoiceId: string): Promise<string> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { riad: true } });
    // Payments recorded up to the issue: a reprint shows exactly what the guest received.
    const payments = await this.prisma.payment.findMany({
      where: { stayId: invoice.stayId, createdAt: { lte: invoice.issuedAt } },
      orderBy: { paidAt: 'asc' },
    });
    const pdf = await this.render(invoice, invoice.riad, payments);
    const key = `riads/${invoice.riadId}/invoices/${invoice.year}/${invoice.number}.pdf`;
    await this.storage.put('documents', key, pdf, 'application/pdf');
    await this.prisma.invoice.update({ where: { id: invoice.id }, data: { pdfKey: key } });
    return key;
  }

  render(invoice: Invoice, riad: Riad, payments: Payment[]): Promise<Buffer> {
    const b = invoice.breakdown as unknown as InvoiceBreakdown;
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Facture ${invoice.number}`, Author: riad.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    const left = 50;
    const right = doc.page.width - 50;
    const width = right - left;

    // Header: riad identity (left), invoice number (right)
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(18).text(clean(riad.name), left, 50, { width: width / 2 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(9);
    const identity = [
      riad.address,
      riad.city,
      [riad.phone, riad.email].filter(Boolean).join(' · '),
      [
        riad.ice && `ICE : ${riad.ice}`,
        riad.fiscalId && `IF : ${riad.fiscalId}`,
        riad.rcNumber && `RC : ${riad.rcNumber}`,
        riad.patente && `Patente : ${riad.patente}`,
      ]
        .filter(Boolean)
        .join(' · '),
    ].filter(Boolean) as string[];
    for (const l of identity) doc.text(clean(l), { width: width / 2 });

    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(20).text('FACTURE', left + width / 2, 50, { width: width / 2, align: 'right' });
    doc.fillColor('#14211f').font('Helvetica').fontSize(10);
    doc.text(`N° ${invoice.number}`, { width: width / 2, align: 'right' });
    doc.text(`Date : ${day(invoice.issuedAt.toISOString().slice(0, 10))}`, { width: width / 2, align: 'right' });

    // Client & stay
    let y = Math.max(doc.y, 120) + 20;
    doc.roundedRect(left, y, width, 64, 6).fillAndStroke('#f3f6f5', LINE);
    doc.fillColor(MUTED).fontSize(8).text('CLIENT', left + 12, y + 10);
    doc.fillColor('#14211f').font('Helvetica-Bold').fontSize(11).text(clean(b.guest?.name ?? '-'), left + 12, y + 22);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    if (b.guest?.nationality) doc.text(`Nationalité : ${b.guest.nationality}`, left + 12, y + 38);
    doc.fillColor(MUTED).fontSize(8).text('SÉJOUR', left + width / 2, y + 10);
    doc.fillColor('#14211f').fontSize(9).text(
      clean(
        `${b.stay.roomName ?? ''}\nDu ${day(b.stay.checkInDate)} au ${day(b.stay.checkOutDate)} - ${b.stay.nights} nuit(s)\n${b.stay.adults} adulte(s), ${b.stay.children} enfant(s)`,
      ),
      left + width / 2,
      y + 22,
      { width: width / 2 - 12 },
    );

    // Lines table
    y += 84;
    const cols = [
      { label: 'Désignation', x: left, w: 230, align: 'left' as const },
      { label: 'Qté', x: left + 230, w: 40, align: 'right' as const },
      { label: 'P.U. TTC', x: left + 270, w: 80, align: 'right' as const },
      { label: 'TVA', x: left + 350, w: 50, align: 'right' as const },
      { label: 'Total TTC', x: left + 400, w: width - 400, align: 'right' as const },
    ];
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TEAL);
    for (const c of cols) doc.text(c.label, c.x, y, { width: c.w, align: c.align });
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(TEAL).lineWidth(1).stroke();
    y += 6;
    doc.font('Helvetica').fillColor('#14211f');
    for (const l of b.lines) {
      const values = [
        clean(lineLabel(l, b)),
        String(l.quantity),
        money(l.unitPrice),
        l.kind === 'ACCOMMODATION' || l.kind === 'EXTRA' ? pct(l.tvaRate) : '-',
        money(l.totalTtc),
      ];
      const h = doc.heightOfString(values[0]!, { width: cols[0]!.w });
      cols.forEach((c, i) => doc.text(values[i]!, c.x, y, { width: c.w, align: c.align }));
      y += Math.max(h, 12) + 6;
      doc.moveTo(left, y - 3).lineTo(right, y - 3).strokeColor(LINE).lineWidth(0.5).stroke();
    }

    // Totals
    y += 8;
    const tx = left + width / 2;
    const tw = width / 2;
    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(bold ? TEAL : '#14211f');
      // Long labels wrap: advance by the real height so rows never overlap.
      const h = doc.heightOfString(label, { width: tw - 110 });
      doc.text(label, tx, y, { width: tw - 110 });
      doc.text(value, tx + tw - 110, y, { width: 110, align: 'right' });
      y += Math.max(h, bold ? 14 : 10) + 4;
    };
    row('Total HT', money(invoice.totalHt));
    for (const g of b.tvaByRate) if (g.tva > 0) row(`TVA ${pct(g.rate)} (base ${money(g.base)})`, money(g.tva));
    if (invoice.taxeSejour) row('Taxe de séjour', money(invoice.taxeSejour));
    if (invoice.tpt) row('Taxe de promotion touristique', money(invoice.tpt));
    doc.moveTo(tx, y).lineTo(right, y).strokeColor(TEAL).lineWidth(1).stroke();
    y += 6;
    row('Total TTC', money(invoice.totalTtc), true);

    const paid = payments.reduce((n, p) => n + p.amount, 0);
    for (const p of payments) row(`${METHOD[p.method]} · ${day(p.paidAt.toISOString().slice(0, 10))}`, money(-p.amount));
    row('Reste à payer', money(Math.max(0, invoice.totalTtc - paid)), true);

    // Amount in words + legal footer
    y += 12;
    doc.font('Helvetica').fontSize(9).fillColor('#14211f').text(
      `Arrêtée la présente facture à la somme de ${madInWords(invoice.totalTtc)} TTC.`,
      left,
      y,
      { width },
    );
    doc.fontSize(8).fillColor(MUTED).text(
      'Montants en dirhams marocains (MAD). Taxe de séjour et taxe de promotion touristique non soumises à la TVA.',
      left,
      doc.page.height - 80,
      { width, align: 'center' },
    );

    doc.end();
    return done;
  }
}
