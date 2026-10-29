import { describe, expect, it } from 'vitest';
import { addDays, isIsoDate, nightsBetween, todayIso } from './dates';
import { stayFormSchema } from './schemas/stays';
import { accommodationTotal, canSetRoomStatusManually, canTransitionStay } from './stays';

describe('dates', () => {
  it('validates calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
  });

  it('counts nights across month and DST boundaries', () => {
    expect(nightsBetween('2026-01-30', '2026-02-02')).toBe(3);
    expect(nightsBetween('2026-03-28', '2026-04-02')).toBe(5);
    expect(nightsBetween('2026-05-01', '2026-05-01')).toBe(0);
  });

  it('adds days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it("uses Casablanca's calendar day, not UTC", () => {
    // 23:30 UTC on 31 Dec 2025 was already 1 Jan in Casablanca (UTC+1 until Sept 2026).
    expect(todayIso('Africa/Casablanca', new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01');
  });
});

describe('stay lifecycle', () => {
  it.each([
    ['PENDING', 'CHECKED_IN', true],
    ['PENDING', 'CANCELLED', true],
    ['CHECKED_IN', 'CHECKED_OUT', true],
    ['PENDING', 'CHECKED_OUT', false],
    ['CHECKED_IN', 'CANCELLED', false],
    ['CHECKED_OUT', 'CHECKED_IN', false],
    ['CANCELLED', 'CHECKED_IN', false],
  ] as const)('%s -> %s = %s', (from, to, ok) => {
    expect(canTransitionStay(from, to)).toBe(ok);
  });
});

describe('room status rules', () => {
  it('never lets staff set OCCUPIED by hand', () => {
    expect(canSetRoomStatusManually('FREE', 'OCCUPIED')).toBe(false);
  });
  it('never lets staff free an occupied room by hand', () => {
    expect(canSetRoomStatusManually('OCCUPIED', 'FREE')).toBe(false);
  });
  it('allows cleaning -> free and free -> out of service', () => {
    expect(canSetRoomStatusManually('CLEANING', 'FREE')).toBe(true);
    expect(canSetRoomStatusManually('FREE', 'OUT_OF_SERVICE')).toBe(true);
  });
});

describe('accommodationTotal', () => {
  it('multiplies integer centimes', () => expect(accommodationTotal(95050, 3)).toBe(285150));
  it('rejects fractional prices', () => expect(() => accommodationTotal(10.5, 1)).toThrow());
});

describe('stayFormSchema', () => {
  const base = {
    source: 'WALK_IN',
    checkInDate: '2026-05-01',
    checkOutDate: '2026-05-03',
    adults: '2',
    children: '0',
    pricePerNightMad: '900',
    otaCommissionMad: '0',
  };
  it('accepts a valid stay', () => expect(stayFormSchema.safeParse(base).success).toBe(true));
  it('rejects check-out on or before check-in', () => {
    const r = stayFormSchema.safeParse({ ...base, checkOutDate: '2026-05-01' });
    expect(r.success).toBe(false);
  });
});
