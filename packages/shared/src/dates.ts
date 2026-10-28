import { TIMEZONE } from './constants';

/**
 * Calendar dates (check-in, check-out, birth date…) travel as "YYYY-MM-DD" strings and
 * are stored as Postgres DATE (UTC midnight in JS). Never use local-time Date math on them.
 */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function isoToUtcDate(iso: IsoDate): Date {
  if (!isIsoDate(iso)) throw new Error(`Invalid date: "${iso}"`);
  return new Date(`${iso}T00:00:00.000Z`);
}

export function utcDateToIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in the riad's timezone (Africa/Casablanca by default). */
export function todayIso(timeZone: string = TIMEZONE, now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return utcDateToIso(new Date(isoToUtcDate(iso).getTime() + days * DAY_MS));
}

/** Number of nights between two calendar dates (check-out minus check-in). */
export function nightsBetween(checkIn: IsoDate, checkOut: IsoDate): number {
  return Math.round((isoToUtcDate(checkOut).getTime() - isoToUtcDate(checkIn).getTime()) / DAY_MS);
}
