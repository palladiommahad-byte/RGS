import { TIMEZONE } from './constants';
import { addDays, isoToUtcDate, nightsBetween, todayIso, type IsoDate } from './dates';
import { addMonths } from './finance';

export const CONTRACT_TYPES = ['CDI', 'CDD', 'ANAPEC', 'FREELANCE', 'OTHER'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'UNPAID', 'OTHER'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** A second scan within this delay is ignored (double scan, badge held too long). */
export const CLOCK_DEBOUNCE_MS = 60_000;
/** An open shift older than this is treated as a forgotten check-out: the scan starts a new shift. */
export const MAX_SHIFT_MS = 16 * 3_600_000;

export type ClockDecision = 'IN' | 'OUT' | 'DUPLICATE';

/**
 * What a badge scan means. `openSince` is the check-in time of the employee's open shift
 * (if any), `lastEventAt` their latest check-in or check-out.
 */
export function clockDecision(openSince: Date | null, lastEventAt: Date | null, now: Date): ClockDecision {
  if (lastEventAt && now.getTime() - lastEventAt.getTime() < CLOCK_DEBOUNCE_MS) return 'DUPLICATE';
  if (openSince && now.getTime() - openSince.getTime() < MAX_SHIFT_MS) return 'OUT';
  return 'IN';
}

/** Whole minutes between two instants (never negative). */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

/** "YYYY-MM" */
export function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Offset of `timeZone` from UTC at `instant`, in ms, from the runtime's tz data (keep it current). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which `iso` starts (local midnight) in `timeZone`. */
export function zonedMidnight(iso: IsoDate, timeZone: string = TIMEZONE): Date {
  const guess = isoToUtcDate(iso).getTime();
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  // Re-check with the offset in force at the result (offset changes around DST switches).
  return new Date(guess - zoneOffsetMs(new Date(first), timeZone));
}

/** [start, end) instants of a "YYYY-MM" month in the riad's timezone. */
export function monthInstants(month: string, timeZone: string = TIMEZONE): { start: Date; end: Date } {
  const first = `${month}-01`;
  return { start: zonedMidnight(first, timeZone), end: zonedMidnight(addMonths(first, 1), timeZone) };
}

/** Calendar date of an instant in the riad's timezone. */
export function localDate(instant: Date, timeZone: string = TIMEZONE): IsoDate {
  return todayIso(timeZone, instant);
}

/** Leave length in calendar days, both ends included. */
export function leaveDays(start: IsoDate, end: IsoDate): number {
  return nightsBetween(start, end) + 1;
}

/** Days of the inclusive range [start, end] that fall inside the "YYYY-MM" month. */
export function leaveDaysInMonth(start: IsoDate, end: IsoDate, month: string): number {
  const from = start > `${month}-01` ? start : `${month}-01`;
  const lastDay = addDays(addMonths(`${month}-01`, 1), -1);
  const to = end < lastDay ? end : lastDay;
  return to < from ? 0 : leaveDays(from, to);
}

/** Inclusive date ranges overlap. */
export function datesOverlap(aStart: IsoDate, aEnd: IsoDate, bStart: IsoDate, bEnd: IsoDate): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export type PayrollAmounts = { baseSalary: number; bonuses: number; advances: number; deductions: number };

/**
 * Net paid at month end: base + bonuses − advances already handed out − deductions.
 * Social charges (CNSS, AMO) and income tax are the accountant's job and entered as
 * deductions; nothing here is a legal rate.
 */
export function payrollNet(a: PayrollAmounts): number {
  return a.baseSalary + a.bonuses - a.advances - a.deductions;
}
