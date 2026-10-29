import { describe, expect, it } from 'vitest';
import {
  addMonths,
  adr,
  costPerOccupiedNight,
  isSpendingSpike,
  margin,
  occupancyRate,
  overlapNights,
  percentChange,
  previousPeriod,
  prorate,
  revpar,
} from './finance';

describe('overlapNights', () => {
  it('counts only the nights inside the period', () => {
    // Stay 29 Sep -> 3 Oct, period October: nights of 1 and 2 Oct.
    expect(overlapNights('2026-09-29', '2026-10-03', '2026-10-01', '2026-11-01')).toBe(2);
    expect(overlapNights('2026-10-30', '2026-11-04', '2026-10-01', '2026-11-01')).toBe(2);
    expect(overlapNights('2026-10-05', '2026-10-08', '2026-10-01', '2026-11-01')).toBe(3);
  });
  it('is 0 outside the period (check-out day is not a night)', () => {
    expect(overlapNights('2026-09-28', '2026-10-01', '2026-10-01', '2026-11-01')).toBe(0);
    expect(overlapNights('2026-11-01', '2026-11-03', '2026-10-01', '2026-11-01')).toBe(0);
  });
});

describe('KPIs', () => {
  // 10 rooms × 30 days = 300 available nights, 210 occupied, 210 000 MAD HT accommodation.
  const available = 300;
  const occupied = 210;
  const accommodation = 21_000_000;

  it('occupancy = occupied ÷ available', () => expect(occupancyRate(occupied, available)).toBeCloseTo(0.7));
  it('ADR = accommodation revenue ÷ occupied nights', () => expect(adr(accommodation, occupied)).toBe(100_000));
  it('RevPAR = accommodation revenue ÷ available nights', () => expect(revpar(accommodation, available)).toBe(70_000));
  it('RevPAR = ADR × occupancy', () => {
    expect(revpar(accommodation, available)).toBe(Math.round(adr(accommodation, occupied)! * occupancyRate(occupied, available)!));
  });
  it('cost per occupied night', () => expect(costPerOccupiedNight(8_400_000, occupied)).toBe(40_000));
  it('margin can be negative', () => expect(margin(-500, 1000)).toBe(-0.5));
  it('returns null instead of dividing by zero', () => {
    expect(occupancyRate(0, 0)).toBeNull();
    expect(adr(1000, 0)).toBeNull();
    expect(revpar(1000, 0)).toBeNull();
    expect(costPerOccupiedNight(1000, 0)).toBeNull();
    expect(margin(100, 0)).toBeNull();
  });
});

describe('comparison helpers', () => {
  it('percentChange', () => {
    expect(percentChange(120, 100)).toBeCloseTo(0.2);
    expect(percentChange(80, 100)).toBeCloseTo(-0.2);
    expect(percentChange(50, 0)).toBeNull();
    expect(percentChange(-50, -100)).toBeCloseTo(0.5);
  });
  it('previousPeriod has the same length', () => {
    expect(previousPeriod('2026-10-01', '2026-10-31')).toEqual({ from: '2026-08-31', to: '2026-09-30' });
    expect(previousPeriod('2026-10-29', '2026-10-29')).toEqual({ from: '2026-10-28', to: '2026-10-28' });
  });
  it('prorates a commission by nights', () => expect(prorate(30000, 2, 3)).toBe(20000));
  it('addMonths crosses years', () => {
    expect(addMonths('2026-10-29', -10)).toBe('2025-12-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
  });
});

describe('isSpendingSpike', () => {
  it('flags > 25 % above the 3-month average', () => {
    expect(isSpendingSpike(1300, [1000, 1000, 1000])).toBe(true);
    expect(isSpendingSpike(1250, [1000, 1000, 1000])).toBe(false);
  });
  it('ignores categories with no history', () => expect(isSpendingSpike(500, [0, 0, 0])).toBe(false));
});
