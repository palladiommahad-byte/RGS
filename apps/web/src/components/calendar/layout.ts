import { addDays, nightsBetween, type IsoDate, type StaySummaryDto } from '@riad/shared';

/** Monday of the week containing `iso`. */
export function weekStartOf(iso: IsoDate): IsoDate {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

export type Bar = { stay: StaySummaryDto; left: number; right: number; lane: number; cutStart: boolean; cutEnd: boolean };

/**
 * Bars for one row of `days` columns starting at `rowStart`, hotel style: from the middle
 * of the arrival day to the middle of the departure day, so a departure and an arrival
 * share a day without overlapping. Overlaps go to the next lane.
 */
export function rowBars(stays: StaySummaryDto[], rowStart: IsoDate, days: number): Bar[] {
  const bars = stays
    .filter((s) => s.status !== 'CANCELLED')
    .map((stay) => {
      const inIdx = nightsBetween(rowStart, stay.checkInDate);
      const outIdx = nightsBetween(rowStart, stay.checkOutDate);
      return {
        stay,
        left: inIdx < 0 ? 0 : inIdx + 0.5,
        right: outIdx >= days ? days : outIdx + 0.5,
        lane: 0,
        cutStart: inIdx < 0,
        cutEnd: outIdx >= days,
      };
    })
    .filter((b) => b.right > 0 && b.left < days && b.right > b.left)
    .sort((a, b) => a.left - b.left || b.right - a.right);
  const laneEnds: number[] = [];
  for (const b of bars) {
    let lane = laneEnds.findIndex((end) => end <= b.left);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = b.right;
    b.lane = lane;
  }
  return bars;
}

export const guestName = (s: StaySummaryDto, fallback: string) =>
  s.mainGuest ? `${s.mainGuest.firstName} ${s.mainGuest.lastName}`.trim() : fallback;
