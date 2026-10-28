import type { RoomStatus, StayStatus } from './constants';
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
