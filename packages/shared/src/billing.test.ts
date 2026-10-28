import { describe, expect, it } from 'vitest';
import { computeBill, formatInvoiceNumber, htFromTtc, type BillInput, type TaxRate } from './billing';

const TVA10: TaxRate = { code: 'TVA_ACCOMMODATION', mode: 'PERCENT', value: 1000 };
const FOOD20: TaxRate = { code: 'TVA_FOOD', mode: 'PERCENT', value: 2000 };
const SEJOUR: TaxRate = { code: 'TAXE_SEJOUR', mode: 'PER_PERSON_PER_NIGHT', value: 2500 }; // 25 MAD
const TPT: TaxRate = { code: 'TPT', mode: 'PER_PERSON_PER_NIGHT', value: 1000 }; // 10 MAD

const base: BillInput = {
  nights: 3,
  adults: 2,
  pricePerNight: 110000,
  accommodationTtc: 330000, // 3 × 1 100 MAD
  extras: [],
  rates: [TVA10],
};

describe('htFromTtc', () => {
  it('extracts 10% TVA exactly', () => expect(htFromTtc(110000, 1000)).toBe(100000));
  it('rounds to the nearest centime', () => expect(htFromTtc(100, 1000)).toBe(91)); // 90.909…
  it('is the identity at 0%', () => expect(htFromTtc(12345, 0)).toBe(12345));
  it('rejects fractional amounts', () => expect(() => htFromTtc(10.5, 1000)).toThrow());
});

describe('computeBill', () => {
  it('splits a room-only bill into HT and TVA', () => {
    const r = computeBill(base);
    expect(r.totals).toEqual({ totalHt: 300000, tvaAmount: 30000, taxeSejour: 0, tpt: 0, totalTtc: 330000 });
    expect(r.missingRates).toEqual(['TAXE_SEJOUR', 'TPT']);
  });

  it('adds taxe de séjour and TPT per adult per night, without TVA', () => {
    const r = computeBill({ ...base, rates: [TVA10, SEJOUR, TPT] });
    // 25 MAD × 2 adults × 3 nights = 150 MAD; 10 MAD × 6 = 60 MAD
    expect(r.totals.taxeSejour).toBe(15000);
    expect(r.totals.tpt).toBe(6000);
    expect(r.totals.totalTtc).toBe(330000 + 15000 + 6000);
    expect(r.totals.tvaAmount).toBe(30000);
    expect(r.missingRates).toEqual([]);
  });

  it('uses TVA_FOOD for food extras and the accommodation rate for the rest', () => {
    const r = computeBill({
      ...base,
      rates: [TVA10, FOOD20],
      extras: [
        { label: 'Dîner', category: 'FOOD', quantity: 2, unitPrice: 18000, total: 36000 },
        { label: 'Hammam', category: 'HAMMAM', quantity: 1, unitPrice: 22000, total: 22000 },
      ],
    });
    const [, dinner, hammam] = r.lines;
    expect(dinner).toMatchObject({ totalHt: 30000, tva: 6000, tvaRate: 2000 });
    expect(hammam).toMatchObject({ totalHt: 20000, tva: 2000, tvaRate: 1000 });
    expect(r.tvaByRate).toEqual([
      { rate: 1000, base: 320000, tva: 32000 },
      { rate: 2000, base: 30000, tva: 6000 },
    ]);
    expect(r.totals.totalTtc).toBe(330000 + 36000 + 22000);
  });

  it('falls back to the accommodation rate for food and warns when TVA_FOOD is missing', () => {
    const r = computeBill({
      ...base,
      extras: [{ label: 'Petit-déjeuner', category: 'FOOD', quantity: 1, unitPrice: 11000, total: 11000 }],
    });
    expect(r.lines[1]).toMatchObject({ tvaRate: 1000, tva: 1000 });
    expect(r.missingRates).toContain('TVA_FOOD');
  });

  it('supports a percentage taxe de séjour on accommodation HT', () => {
    const r = computeBill({ ...base, rates: [TVA10, { code: 'TAXE_SEJOUR', mode: 'PERCENT', value: 500 }] });
    expect(r.totals.taxeSejour).toBe(15000); // 5% of 3 000 MAD HT
  });

  it('always balances: TTC = HT + TVA + taxe de séjour + TPT', () => {
    const r = computeBill({
      nights: 7,
      adults: 3,
      pricePerNight: 97333,
      accommodationTtc: 681331,
      rates: [TVA10, FOOD20, SEJOUR, TPT],
      extras: [
        { label: 'A', category: 'FOOD', quantity: 3, unitPrice: 3333, total: 9999 },
        { label: 'B', category: 'TRANSFER', quantity: 1, unitPrice: 33301, total: 33301 },
        { label: 'C', category: 'EXCURSION', quantity: 2, unitPrice: 45555, total: 91110 },
      ],
    });
    const t = r.totals;
    expect(t.totalHt + t.tvaAmount + t.taxeSejour + t.tpt).toBe(t.totalTtc);
    for (const l of r.lines) expect(Number.isSafeInteger(l.totalHt) && Number.isSafeInteger(l.tva)).toBe(true);
  });

  it('works with no TVA configured at all', () => {
    const r = computeBill({ ...base, rates: [] });
    expect(r.totals).toMatchObject({ totalHt: 330000, tvaAmount: 0, totalTtc: 330000 });
    expect(r.missingRates).toEqual(['TVA_ACCOMMODATION', 'TAXE_SEJOUR', 'TPT']);
  });
});

describe('formatInvoiceNumber', () => {
  it('pads the yearly sequence', () => expect(formatInvoiceNumber('RIAD', 2026, 42)).toBe('RIAD-2026-00042'));
});
