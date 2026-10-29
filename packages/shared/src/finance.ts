import { addDays, nightsBetween, type IsoDate } from './dates';

/**
 * Hotel KPIs. All amounts are integer centimes (HT); ratios are plain numbers.
 * Returns null when the denominator is zero (nothing to show rather than 0 or NaN).
 */

/** Nights of a stay [checkIn, checkOut) that fall inside the period [from, toExclusive). */
export function overlapNights(checkIn: IsoDate, checkOut: IsoDate, from: IsoDate, toExclusive: IsoDate): number {
  const start = checkIn > from ? checkIn : from;
  const end = checkOut < toExclusive ? checkOut : toExclusive;
  return end > start ? nightsBetween(start, end) : 0;
}

/** Occupied room-nights ÷ available room-nights (0..1). */
export function occupancyRate(occupiedNights: number, availableNights: number): number | null {
  return availableNights > 0 ? occupiedNights / availableNights : null;
}

/** Average Daily Rate: accommodation revenue ÷ occupied nights (centimes). */
export function adr(accommodationRevenue: number, occupiedNights: number): number | null {
  return occupiedNights > 0 ? Math.round(accommodationRevenue / occupiedNights) : null;
}

/** Revenue per available room-night (centimes). */
export function revpar(accommodationRevenue: number, availableNights: number): number | null {
  return availableNights > 0 ? Math.round(accommodationRevenue / availableNights) : null;
}

/** Expenses ÷ occupied nights (centimes). */
export function costPerOccupiedNight(expenses: number, occupiedNights: number): number | null {
  return occupiedNights > 0 ? Math.round(expenses / occupiedNights) : null;
}

/** Net profit ÷ revenue (can be negative). */
export function margin(profit: number, revenue: number): number | null {
  return revenue !== 0 ? profit / revenue : null;
}

/** Relative change vs the previous period, null when there is nothing to compare to. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** Share of a stay amount (e.g. OTA commission) for the nights inside a period. */
export function prorate(amount: number, part: number, whole: number): number {
  return whole > 0 ? Math.round((amount * part) / whole) : 0;
}

/** The period of the same length right before [from, toInclusive]. */
export function previousPeriod(from: IsoDate, toInclusive: IsoDate): { from: IsoDate; to: IsoDate } {
  const days = nightsBetween(from, addDays(toInclusive, 1));
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/** First day of the month containing `iso`. */
export function monthStartOf(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`;
}

/** First day of the month `n` months after (negative = before) the month of `iso`. */
export function addMonths(iso: IsoDate, n: number): IsoDate {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

/** An expense category spends more than `threshold` × its average of the 3 previous months. */
export function isSpendingSpike(current: number, previousMonths: number[], threshold = 1.25): boolean {
  if (previousMonths.length === 0) return false;
  const avg = previousMonths.reduce((a, b) => a + b, 0) / previousMonths.length;
  return avg > 0 && current > avg * threshold;
}
