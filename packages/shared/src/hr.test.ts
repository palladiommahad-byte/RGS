import { describe, expect, it } from 'vitest';
import {
  CLOCK_DEBOUNCE_MS,
  clockDecision,
  datesOverlap,
  isMonth,
  leaveDays,
  leaveDaysInMonth,
  localDate,
  MAX_SHIFT_MS,
  minutesBetween,
  monthInstants,
  payrollNet,
  zonedMidnight,
} from './hr';
import { leaveFormSchema } from './schemas/hr';

const at = (iso: string) => new Date(iso);

describe('clockDecision', () => {
  const now = at('2026-10-29T17:00:00Z');

  it('checks in when nothing is open', () => {
    expect(clockDecision(null, null, now)).toBe('IN');
    expect(clockDecision(null, at('2026-10-28T17:00:00Z'), now)).toBe('IN');
  });

  it('checks out an open shift', () => {
    expect(clockDecision(at('2026-10-29T08:00:00Z'), at('2026-10-29T08:00:00Z'), now)).toBe('OUT');
  });

  it('ignores a second scan within the debounce delay', () => {
    const justNow = new Date(now.getTime() - CLOCK_DEBOUNCE_MS + 1000);
    expect(clockDecision(justNow, justNow, now)).toBe('DUPLICATE');
    expect(clockDecision(null, justNow, now)).toBe('DUPLICATE');
  });

  it('starts a new shift when the open one is a forgotten check-out', () => {
    const stale = new Date(now.getTime() - MAX_SHIFT_MS - 1);
    expect(clockDecision(stale, stale, now)).toBe('IN');
  });
});

describe('time helpers', () => {
  it('counts whole minutes, never negative', () => {
    expect(minutesBetween(at('2026-10-29T08:00:00Z'), at('2026-10-29T17:05:29Z'))).toBe(545);
    expect(minutesBetween(at('2026-10-29T08:00:00Z'), at('2026-10-29T07:00:00Z'))).toBe(0);
  });

  // Dates where every tz release agrees: UTC+1 in 2025, UTC+0 during Ramadan 2026.
  // (Morocco moved to permanent UTC+0 on 20 Sept 2026 — tzdata 2026c.)
  it('finds local midnight in Casablanca from the zone data', () => {
    expect(zonedMidnight('2025-10-01').toISOString()).toBe('2025-09-30T23:00:00.000Z');
    expect(zonedMidnight('2026-03-01').toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(zonedMidnight('2026-10-01', 'UTC').toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('gives month bounds and local dates', () => {
    const { start, end } = monthInstants('2025-10');
    expect(start.toISOString()).toBe('2025-09-30T23:00:00.000Z');
    expect(end.toISOString()).toBe('2025-10-31T23:00:00.000Z');
    // 23:30 UTC on 31 Oct 2025 was already 1 Nov in Marrakech.
    expect(localDate(at('2025-10-31T23:30:00Z'))).toBe('2025-11-01');
  });

  it('validates months', () => {
    expect(isMonth('2026-10')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-1')).toBe(false);
  });
});

describe('leaves', () => {
  it('counts calendar days, both ends included', () => {
    expect(leaveDays('2026-10-05', '2026-10-05')).toBe(1);
    expect(leaveDays('2026-10-28', '2026-11-03')).toBe(7);
  });

  it('splits a leave across months', () => {
    expect(leaveDaysInMonth('2026-10-28', '2026-11-03', '2026-10')).toBe(4);
    expect(leaveDaysInMonth('2026-10-28', '2026-11-03', '2026-11')).toBe(3);
    expect(leaveDaysInMonth('2026-10-28', '2026-11-03', '2026-12')).toBe(0);
  });

  it('detects overlapping ranges (inclusive)', () => {
    expect(datesOverlap('2026-10-01', '2026-10-05', '2026-10-05', '2026-10-09')).toBe(true);
    expect(datesOverlap('2026-10-01', '2026-10-04', '2026-10-05', '2026-10-09')).toBe(false);
  });

  it('refuses an end date before the start date', () => {
    const r = leaveFormSchema.safeParse({
      employeeId: '6f1c1d2e-0000-4000-8000-000000000000',
      type: 'ANNUAL',
      startDate: '2026-10-05',
      endDate: '2026-10-04',
    });
    expect(r.success).toBe(false);
  });
});

describe('payrollNet', () => {
  it('adds bonuses and subtracts advances and deductions', () => {
    expect(payrollNet({ baseSalary: 350000, bonuses: 50000, advances: 100000, deductions: 22000 })).toBe(278000);
  });
});
