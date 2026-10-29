import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma, TaxSetting } from '@prisma/client';
import {
  addDays,
  addMonths,
  isoToUtcDate,
  utcDateToIso,
  type TaxCode,
  type TaxMode,
  type TaxReportDto,
  type TaxSettingDto,
} from '@riad/shared';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import type { InvoiceBreakdown } from '../invoices/invoice-breakdown';
import { PrismaService } from '../prisma/prisma.service';

export type TaxSettingInput = { code: TaxCode; mode: TaxMode; value: number; validFrom: string; validTo?: string | null };

const toDto = (s: TaxSetting): TaxSettingDto => ({
  id: s.id,
  code: s.code,
  mode: s.mode,
  value: s.value,
  validFrom: utcDateToIso(s.validFrom),
  validTo: s.validTo ? utcDateToIso(s.validTo) : null,
});

const END_OF_TIME = '9999-12-31';

@Injectable()
export class TaxesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(p: AuthPrincipal): Promise<TaxSettingDto[]> {
    const rows = await this.prisma.taxSetting.findMany({
      where: { riadId: p.riadId },
      orderBy: [{ code: 'asc' }, { validFrom: 'desc' }],
    });
    return rows.map(toDto);
  }

  /**
   * A new rate for a code that has an open-ended one closes the old rate the day before,
   * so "TVA 10 % from 2020" + "TVA 12 % from 2027" just works. Any other overlap is refused.
   */
  async create(p: AuthPrincipal, input: TaxSettingInput): Promise<TaxSettingDto> {
    validate(input);
    const row = await this.prisma.$transaction(async (tx) => {
      const open = await tx.taxSetting.findFirst({
        where: { riadId: p.riadId, code: input.code, validTo: null, validFrom: { lt: isoToUtcDate(input.validFrom) } },
      });
      if (open) {
        await tx.taxSetting.update({ where: { id: open.id }, data: { validTo: isoToUtcDate(addDays(input.validFrom, -1)) } });
      }
      await assertNoOverlap(tx, p.riadId, input);
      const created = await tx.taxSetting.create({
        data: {
          riadId: p.riadId,
          code: input.code,
          mode: input.mode,
          value: input.value,
          validFrom: isoToUtcDate(input.validFrom),
          validTo: input.validTo ? isoToUtcDate(input.validTo) : null,
          createdBy: p.userId,
        },
      });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'tax_setting.create',
          entity: 'TaxSetting',
          entityId: created.id,
          diff: { ...input, closedPrevious: open?.id ?? null },
        },
        tx,
      );
      return created;
    });
    return toDto(row);
  }

  async update(p: AuthPrincipal, id: string, input: Partial<TaxSettingInput>): Promise<TaxSettingDto> {
    const before = await this.findOrThrow(p.riadId, id);
    const merged: TaxSettingInput = {
      ...toDto(before),
      ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    } as TaxSettingInput;
    validate(merged);
    const row = await this.prisma.$transaction(async (tx) => {
      await assertNoOverlap(tx, p.riadId, merged, id);
      const updated = await tx.taxSetting.update({
        where: { id },
        data: {
          code: merged.code,
          mode: merged.mode,
          value: merged.value,
          validFrom: isoToUtcDate(merged.validFrom),
          validTo: merged.validTo ? isoToUtcDate(merged.validTo) : null,
        },
      });
      await this.audit.log(
        { riadId: p.riadId, userId: p.userId, action: 'tax_setting.update', entity: 'TaxSetting', entityId: id, diff: { before: toDto(before), after: { ...merged } } },
        tx,
      );
      return updated;
    });
    return toDto(row);
  }

  /** Safe for history: issued invoices keep a snapshot of the rates they used. */
  async remove(p: AuthPrincipal, id: string): Promise<void> {
    const before = await this.findOrThrow(p.riadId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.taxSetting.delete({ where: { id } });
      await this.audit.log(
        { riadId: p.riadId, userId: p.userId, action: 'tax_setting.delete', entity: 'TaxSetting', entityId: id, diff: toDto(before) },
        tx,
      );
    });
  }

  /** Monthly declaration figures, from invoices issued in the month (Casablanca date). */
  async report(riadId: string, month: string): Promise<TaxReportDto & { invoices: InvoiceRow[]; expenses: ExpenseRow[] }> {
    const first = `${month}-01`;
    const next = addMonths(first, 1);
    const [invoices, expenses] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { riadId, year: Number(month.slice(0, 4)) },
        orderBy: { sequence: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: { riadId, date: { gte: isoToUtcDate(first), lt: isoToUtcDate(next) } },
        include: { category: true, supplier: { select: { name: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);
    // The issue date in the riad's timezone is frozen in the invoice snapshot.
    const inMonth = invoices.filter((i) => ((i.breakdown as unknown as InvoiceBreakdown | null)?.ratesDate ?? '').startsWith(month));
    const byRate = new Map<number, { rate: number; base: number; tva: number }>();
    for (const i of inMonth) {
      for (const g of (i.breakdown as unknown as InvoiceBreakdown).tvaByRate ?? []) {
        const acc = byRate.get(g.rate) ?? { rate: g.rate, base: 0, tva: 0 };
        acc.base += g.base;
        acc.tva += g.tva;
        byRate.set(g.rate, acc);
      }
    }
    const s = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const tvaCollected = s(inMonth.map((i) => i.tvaAmount));
    const tvaDeductible = s(expenses.map((e) => e.tvaAmount));
    return {
      month,
      invoiceCount: inMonth.length,
      totalHt: s(inMonth.map((i) => i.totalHt)),
      tvaCollected,
      tvaByRate: [...byRate.values()].sort((a, b) => a.rate - b.rate),
      tvaDeductible,
      tvaDue: tvaCollected - tvaDeductible,
      taxeSejour: s(inMonth.map((i) => i.taxeSejour)),
      tpt: s(inMonth.map((i) => i.tpt)),
      totalTtc: s(inMonth.map((i) => i.totalTtc)),
      expenseCount: expenses.filter((e) => e.tvaAmount > 0).length,
      invoices: inMonth.map((i) => ({
        number: i.number,
        date: (i.breakdown as unknown as InvoiceBreakdown).ratesDate,
        totalHt: i.totalHt,
        tva: i.tvaAmount,
        taxeSejour: i.taxeSejour,
        tpt: i.tpt,
        totalTtc: i.totalTtc,
      })),
      expenses: expenses
        .filter((e) => e.tvaAmount > 0)
        .map((e) => ({
          date: utcDateToIso(e.date),
          supplier: e.supplier?.name ?? '',
          category: e.category.nameFr,
          totalTtc: e.amountTtc,
          tva: e.tvaAmount,
        })),
    };
  }

  async reportXlsx(riadId: string, month: string): Promise<Buffer> {
    const r = await this.report(riadId, month);
    const riad = await this.prisma.riad.findUniqueOrThrow({ where: { id: riadId } });
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Riad Manager';
    const mad = (c: number) => c / 100;
    const head = (sheet: ExcelJS.Worksheet) => {
      const row = sheet.getRow(1);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E48' } };
    };

    const summary = wb.addWorksheet('Synthèse');
    summary.columns = [{ header: `${riad.name} — déclaration ${month}`, width: 46 }, { header: 'MAD', width: 16 }];
    head(summary);
    const lines: [string, number | string][] = [
      ['ICE', riad.ice ?? ''],
      ['Factures émises', r.invoiceCount],
      ['Chiffre d’affaires HT', mad(r.totalHt)],
      ...r.tvaByRate.map((g): [string, number] => [`TVA collectée ${g.rate / 100} % (base ${(g.base / 100).toFixed(2)})`, mad(g.tva)]),
      ['TVA collectée (total)', mad(r.tvaCollected)],
      ['TVA déductible (dépenses)', mad(r.tvaDeductible)],
      [r.tvaDue >= 0 ? 'TVA à payer' : 'Crédit de TVA', mad(Math.abs(r.tvaDue))],
      ['Taxe de séjour à reverser à la commune', mad(r.taxeSejour)],
      ['Taxe de promotion touristique (TPT)', mad(r.tpt)],
      ['Total facturé TTC', mad(r.totalTtc)],
      ['Taux à valider par votre comptable', ''],
    ];
    for (const [label, value] of lines) summary.addRow([label, value]).getCell(2).numFmt = '#,##0.00';

    const inv = wb.addWorksheet('Factures');
    inv.columns = [
      { header: 'N°', width: 20 },
      { header: 'Date', width: 12 },
      { header: 'HT', width: 14 },
      { header: 'TVA', width: 12 },
      { header: 'Taxe de séjour', width: 14 },
      { header: 'TPT', width: 10 },
      { header: 'TTC', width: 14 },
    ];
    head(inv);
    for (const i of r.invoices) {
      inv.addRow([i.number, i.date, mad(i.totalHt), mad(i.tva), mad(i.taxeSejour), mad(i.tpt), mad(i.totalTtc)]);
    }
    inv.getColumn(3).numFmt = inv.getColumn(4).numFmt = inv.getColumn(5).numFmt = inv.getColumn(6).numFmt = inv.getColumn(7).numFmt = '#,##0.00';

    const exp = wb.addWorksheet('TVA déductible');
    exp.columns = [
      { header: 'Date', width: 12 },
      { header: 'Fournisseur', width: 26 },
      { header: 'Catégorie', width: 26 },
      { header: 'TTC', width: 14 },
      { header: 'TVA', width: 12 },
    ];
    head(exp);
    for (const e of r.expenses) exp.addRow([e.date, e.supplier, e.category, mad(e.totalTtc), mad(e.tva)]);
    exp.getColumn(4).numFmt = exp.getColumn(5).numFmt = '#,##0.00';

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async findOrThrow(riadId: string, id: string): Promise<TaxSetting> {
    const s = await this.prisma.taxSetting.findFirst({ where: { id, riadId } });
    if (!s) throw new AppException('NOT_FOUND', 'Tax setting not found', HttpStatus.NOT_FOUND);
    return s;
  }
}

type InvoiceRow = { number: string; date: string; totalHt: number; tva: number; taxeSejour: number; tpt: number; totalTtc: number };
type ExpenseRow = { date: string; supplier: string; category: string; totalTtc: number; tva: number };

function validate(i: TaxSettingInput): void {
  if (i.mode === 'PERCENT' && i.value > 10000) {
    throw new AppException('INVALID_RATE', 'A percentage cannot exceed 100 %');
  }
  if (i.code.startsWith('TVA') && i.mode !== 'PERCENT') {
    throw new AppException('INVALID_RATE', 'TVA is always a percentage');
  }
  if (i.validTo && i.validTo < i.validFrom) {
    throw new AppException('INVALID_DATES', 'The end date is before the start date');
  }
}

async function assertNoOverlap(tx: Prisma.TransactionClient, riadId: string, i: TaxSettingInput, exceptId?: string): Promise<void> {
  const others = await tx.taxSetting.findMany({ where: { riadId, code: i.code, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  const end = i.validTo || END_OF_TIME;
  const clash = others.find((o) => {
    const oFrom = utcDateToIso(o.validFrom);
    const oTo = o.validTo ? utcDateToIso(o.validTo) : END_OF_TIME;
    return oFrom <= end && i.validFrom <= oTo;
  });
  if (clash) {
    throw new AppException('TAX_PERIOD_OVERLAP', 'Another rate is already in force for part of this period', HttpStatus.CONFLICT, {
      with: toDto(clash),
    });
  }
}
