import { describe, expect, it } from 'vitest';
import { dueDateInMonth, nextRecurringDate, recurringDueDate } from './expenses';

describe('dueDateInMonth', () => {
  it('uses the day as is when the month has it', () => expect(dueDateInMonth('2026-10-03', 15)).toBe('2026-10-15'));
  it('clamps to the last day of short months', () => {
    expect(dueDateInMonth('2026-02-10', 31)).toBe('2026-02-28');
    expect(dueDateInMonth('2028-02-10', 30)).toBe('2028-02-29'); // leap year
    expect(dueDateInMonth('2026-04-01', 31)).toBe('2026-04-30');
  });
});

describe('recurringDueDate', () => {
  it('is due once the day is reached', () => {
    expect(recurringDueDate('2026-10-05', 5, '2026-01-01')).toBe('2026-10-05');
    expect(recurringDueDate('2026-10-20', 5, '2026-01-01')).toBe('2026-10-05');
  });
  it('is not due before the day', () => expect(recurringDueDate('2026-10-04', 5, '2026-01-01')).toBeNull());
  it('does not backfill a month before the recurring expense was created', () => {
    expect(recurringDueDate('2026-10-28', 5, '2026-10-20')).toBeNull();
    expect(recurringDueDate('2026-10-28', 25, '2026-10-20')).toBe('2026-10-25');
  });
  it('fires on the last day for day 31 in February', () => {
    expect(recurringDueDate('2026-02-28', 31, '2026-01-01')).toBe('2026-02-28');
  });
});

describe('nextRecurringDate', () => {
  it('stays in this month when the day is ahead', () => expect(nextRecurringDate('2026-10-03', 15)).toBe('2026-10-15'));
  it('moves to next month (clamped) once passed', () => {
    expect(nextRecurringDate('2026-10-15', 15)).toBe('2026-11-15');
    expect(nextRecurringDate('2026-01-31', 31)).toBe('2026-02-28');
    expect(nextRecurringDate('2026-12-20', 5)).toBe('2027-01-05');
  });
});
