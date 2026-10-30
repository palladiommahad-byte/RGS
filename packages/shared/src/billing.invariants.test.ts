import { describe, expect, it } from 'vitest';
import { computeBill, htFromTtc, type BillInput, type TaxRate } from './billing';
import { EXTRA_CATEGORIES } from './constants';

/** Deterministic PRNG (mulberry32): the same 2 000 bills on every run. */
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBill(rand: () => number): BillInput {
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)]!;
  const nights = int(1, 30);
  const pricePerNight = int(1, 500_000);
  const rates: TaxRate[] = [];
  if (rand() < 0.9) rates.push({ code: 'TVA_ACCOMMODATION', mode: 'PERCENT', value: pick([0, 700, 1000, 1400, 2000]) });
  if (rand() < 0.7) rates.push({ code: 'TVA_FOOD', mode: 'PERCENT', value: pick([700, 1000, 2000]) });
  if (rand() < 0.8)
    rates.push(
      rand() < 0.5
        ? { code: 'TAXE_SEJOUR', mode: 'PER_PERSON_PER_NIGHT', value: int(0, 5000) }
        : { code: 'TAXE_SEJOUR', mode: 'PERCENT', value: int(0, 1000) },
    );
  if (rand() < 0.6) rates.push({ code: 'TPT', mode: 'PER_PERSON_PER_NIGHT', value: int(0, 2000) });
  const extras = Array.from({ length: int(0, 6) }, (_, i) => {
    const quantity = int(1, 5);
    const unitPrice = int(1, 200_000);
    return { label: `x${i}`, category: pick(EXTRA_CATEGORIES), quantity, unitPrice, total: quantity * unitPrice };
  });
  return { nights, adults: int(1, 6), pricePerNight, accommodationTtc: nights * pricePerNight, extras, rates };
}

describe('billing invariants (2 000 random bills)', () => {
  const rand = prng(20261029);
  const bills = Array.from({ length: 2000 }, () => {
    const input = randomBill(rand);
    return { input, bill: computeBill(input) };
  });

  it('splits every line exactly: HT + TVA = TTC, in whole centimes', () => {
    for (const { bill } of bills) {
      for (const l of bill.lines) {
        expect(Number.isSafeInteger(l.totalHt) && Number.isSafeInteger(l.tva)).toBe(true);
        expect(l.totalHt).toBeGreaterThanOrEqual(0);
        expect(l.tva).toBeGreaterThanOrEqual(0);
        expect(l.totalHt + l.tva).toBe(l.totalTtc);
      }
    }
  });

  it('charges the guest exactly the prices plus the tourist taxes', () => {
    for (const { input, bill } of bills) {
      const t = bill.totals;
      const extras = input.extras.reduce((n, e) => n + e.total, 0);
      expect(t.totalTtc).toBe(input.accommodationTtc + extras + t.taxeSejour + t.tpt);
      expect(t.totalHt + t.tvaAmount + t.taxeSejour + t.tpt).toBe(t.totalTtc);
    }
  });

  it('prints a TVA breakdown that adds up to the totals', () => {
    for (const { bill } of bills) {
      const tva = bill.tvaByRate.reduce((n, g) => n + g.tva, 0);
      const base = bill.tvaByRate.reduce((n, g) => n + g.base, 0);
      expect(tva).toBe(bill.totals.tvaAmount);
      expect(base).toBe(bill.totals.totalHt);
    }
  });

  it('keeps each line TVA within one centime of HT × rate', () => {
    for (const { bill } of bills) {
      for (const l of bill.lines) {
        if (l.kind === 'TAXE_SEJOUR' || l.kind === 'TPT') continue;
        expect(Math.abs(l.tva - Math.round((l.totalHt * l.tvaRate) / 10000))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never makes HT larger than TTC, and HT shrinks as the rate grows', () => {
    const r = prng(7);
    for (let i = 0; i < 2000; i++) {
      const ttc = Math.floor(r() * 10_000_000);
      expect(htFromTtc(ttc, 1000)).toBeLessThanOrEqual(ttc);
      expect(htFromTtc(ttc, 2000)).toBeLessThanOrEqual(htFromTtc(ttc, 1000));
    }
  });
});
