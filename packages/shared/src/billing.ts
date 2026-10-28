import type { ExtraCategory, TaxCode, TaxMode } from './constants';
import { assertCentimes, percentOf, type Centimes } from './money';

/**
 * Invoice maths. Conventions (to be validated by the riad's accountant):
 * - Room prices and extras are entered TTC (what the guest pays); TVA is extracted from
 *   them: HT = round(TTC × 10000 / (10000 + rate in basis points)).
 * - FOOD extras use TVA_FOOD (falls back to TVA_ACCOMMODATION when not configured);
 *   every other extra uses TVA_ACCOMMODATION.
 * - Taxe de séjour and TPT are added on top of the bill and carry no TVA.
 *   PER_PERSON_PER_NIGHT = value × adults × nights (children exempt);
 *   PERCENT = rate × accommodation HT.
 * - Every amount is integer centimes; rounding is per line, half away from zero.
 */

export type TaxRate = { code: TaxCode; mode: TaxMode; value: number };

export type BillExtraInput = {
  label: string;
  category: ExtraCategory;
  quantity: number;
  unitPrice: Centimes;
  total: Centimes;
};

export type BillInput = {
  nights: number;
  adults: number;
  pricePerNight: Centimes;
  accommodationTtc: Centimes;
  extras: BillExtraInput[];
  rates: TaxRate[];
};

export type BillLineKind = 'ACCOMMODATION' | 'EXTRA' | 'TAXE_SEJOUR' | 'TPT';

export type BillLine = {
  kind: BillLineKind;
  label: string;
  category?: ExtraCategory;
  quantity: number;
  unitPrice: Centimes;
  totalTtc: Centimes;
  totalHt: Centimes;
  tva: Centimes;
  /** Basis points, 1000 = 10 %. */
  tvaRate: number;
};

export type BillTotals = {
  totalHt: Centimes;
  tvaAmount: Centimes;
  taxeSejour: Centimes;
  tpt: Centimes;
  totalTtc: Centimes;
};

export type BillComputation = {
  lines: BillLine[];
  totals: BillTotals;
  /** TVA grouped by rate, as printed on the invoice. */
  tvaByRate: { rate: number; base: Centimes; tva: Centimes }[];
  /** Tax codes with no setting in force: shown as a warning, counted as 0. */
  missingRates: TaxCode[];
};

/** HT part of a TTC amount for a TVA rate in basis points. */
export function htFromTtc(ttc: Centimes, rateBp: number): Centimes {
  assertCentimes(ttc);
  assertCentimes(rateBp);
  if (rateBp === 0) return ttc;
  const ht = (Math.abs(ttc) * 10000) / (10000 + rateBp);
  return Math.sign(ttc) * Math.round(ht);
}

function percentRate(rates: TaxRate[], code: TaxCode): number | undefined {
  const r = rates.find((x) => x.code === code);
  return r && r.mode === 'PERCENT' ? r.value : undefined;
}

function taxedLine(
  base: Omit<BillLine, 'totalHt' | 'tva' | 'tvaRate'>,
  rateBp: number,
): BillLine {
  const totalHt = htFromTtc(base.totalTtc, rateBp);
  return { ...base, totalHt, tva: base.totalTtc - totalHt, tvaRate: rateBp };
}

export function computeBill(input: BillInput): BillComputation {
  const { nights, adults, rates } = input;
  const missingRates = (['TVA_ACCOMMODATION', 'TAXE_SEJOUR', 'TPT'] as TaxCode[]).filter(
    (code) => !rates.some((r) => r.code === code),
  );
  const accommodationRate = percentRate(rates, 'TVA_ACCOMMODATION') ?? 0;
  const foodRate = percentRate(rates, 'TVA_FOOD') ?? accommodationRate;
  if (input.extras.some((e) => e.category === 'FOOD') && !rates.some((r) => r.code === 'TVA_FOOD')) {
    missingRates.push('TVA_FOOD');
  }

  const lines: BillLine[] = [
    taxedLine(
      {
        kind: 'ACCOMMODATION',
        label: 'ACCOMMODATION',
        quantity: nights,
        unitPrice: input.pricePerNight,
        totalTtc: input.accommodationTtc,
      },
      accommodationRate,
    ),
    ...input.extras.map((e) =>
      taxedLine(
        { kind: 'EXTRA', label: e.label, category: e.category, quantity: e.quantity, unitPrice: e.unitPrice, totalTtc: e.total },
        e.category === 'FOOD' ? foodRate : accommodationRate,
      ),
    ),
  ];
  const accommodationHt = lines[0]!.totalHt;

  for (const code of ['TAXE_SEJOUR', 'TPT'] as const) {
    const rate = rates.find((r) => r.code === code);
    if (!rate) continue;
    const perPerson = rate.mode === 'PER_PERSON_PER_NIGHT';
    const amount = perPerson ? rate.value * adults * nights : percentOf(accommodationHt, rate.value);
    if (amount === 0) continue;
    lines.push({
      kind: code,
      label: code,
      quantity: perPerson ? adults * nights : 1,
      unitPrice: perPerson ? rate.value : amount,
      totalTtc: amount,
      totalHt: amount,
      tva: 0,
      tvaRate: 0,
    });
  }

  const sum = (pick: (l: BillLine) => number, filter: (l: BillLine) => boolean = () => true) =>
    lines.filter(filter).reduce((n, l) => n + pick(l), 0);
  const taxable = (l: BillLine) => l.kind === 'ACCOMMODATION' || l.kind === 'EXTRA';

  const byRate = new Map<number, { rate: number; base: number; tva: number }>();
  for (const l of lines.filter(taxable)) {
    const g = byRate.get(l.tvaRate) ?? { rate: l.tvaRate, base: 0, tva: 0 };
    g.base += l.totalHt;
    g.tva += l.tva;
    byRate.set(l.tvaRate, g);
  }

  return {
    lines,
    totals: {
      totalHt: sum((l) => l.totalHt, taxable),
      tvaAmount: sum((l) => l.tva, taxable),
      taxeSejour: sum((l) => l.totalTtc, (l) => l.kind === 'TAXE_SEJOUR'),
      tpt: sum((l) => l.totalTtc, (l) => l.kind === 'TPT'),
      totalTtc: sum((l) => l.totalTtc),
    },
    tvaByRate: [...byRate.values()].sort((a, b) => a.rate - b.rate),
    missingRates,
  };
}

/** "RIAD-2026-00042" */
export function formatInvoiceNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(5, '0')}`;
}
