import { TIMEZONE, type RoomStatus, type StayStatus } from './constants';
import type { IsoDate } from './dates';
import { zonedMidnight } from './hr';
import { assertCentimes, type Centimes } from './money';

/** Allowed stay status transitions. Checked-out and cancelled stays are final. */
export const STAY_TRANSITIONS: Record<StayStatus, readonly StayStatus[]> = {
  PENDING: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
};

export function canTransitionStay(from: StayStatus, to: StayStatus): boolean {
  return STAY_TRANSITIONS[from].includes(to);
}

/**
 * Statuses staff can set by hand. OCCUPIED is only ever set by checking a guest in
 * (and left by checking out or moving the guest), so it always matches a real stay.
 */
export const MANUAL_ROOM_STATUSES = ['FREE', 'CLEANING', 'OUT_OF_SERVICE'] as const;

export function canSetRoomStatusManually(current: RoomStatus, next: RoomStatus): boolean {
  return current !== 'OCCUPIED' && (MANUAL_ROOM_STATUSES as readonly string[]).includes(next);
}

/** A guest can be checked into a room that is free or still flagged for cleaning. */
export const CHECKIN_ROOM_STATUSES: readonly RoomStatus[] = ['FREE', 'CLEANING'];

export function accommodationTotal(pricePerNight: Centimes, nights: number): Centimes {
  assertCentimes(pricePerNight);
  if (!Number.isInteger(nights) || nights < 0) throw new Error(`Invalid nights: ${nights}`);
  return pricePerNight * nights;
}

/** A time of day, riad time: "HH:MM" (24 h). */
export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Defaults of the automatic stay cycle (each riad can change them in its settings). */
export const DEFAULT_CHECKOUT_TIME = '12:00';
export const DEFAULT_ROOM_READY_TIME = '15:00';

/** The instant `date` at `time` ("HH:MM") in the riad's time zone. */
export function atRiadTime(date: IsoDate, time: string, timeZone: string = TIMEZONE): Date {
  const [h, m] = time.split(':').map(Number);
  return new Date(zonedMidnight(date, timeZone).getTime() + ((h ?? 0) * 60 + (m ?? 0)) * 60_000);
}

/** Error details of ROOM_BOOKED: who has the room, and where the guest could go instead. */
export type RoomBookedDetails = {
  conflict: { stayId: string; guestName: string | null; checkInDate: IsoDate; checkOutDate: IsoDate };
  freeRooms: { id: string; name: string; type: string }[];
};
