import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CHECKIN_ROOM_STATUSES, isoToUtcDate, utcDateToIso, type IsoDate, type RoomBookedDetails } from '@riad/shared';
import { AppException } from '../common/app-exception';

type Db = Prisma.TransactionClient;

/** Stays holding `roomId` for part of [from, to): checked in there, or pending for it. */
export function bookingsOverlapping(db: Db, riadId: string, roomId: string, from: IsoDate, to: IsoDate, exceptStayId?: string) {
  return db.stay.findMany({
    where: {
      riadId,
      ...(exceptStayId ? { id: { not: exceptStayId } } : {}),
      checkInDate: { lt: isoToUtcDate(to) },
      checkOutDate: { gt: isoToUtcDate(from) },
      OR: [
        { status: 'CHECKED_IN', roomId },
        { status: 'PENDING', requestedRoomId: roomId },
      ],
    },
    include: { guests: { where: { isMain: true }, select: { firstName: true, lastName: true }, take: 1 } },
    orderBy: { checkInDate: 'asc' },
  });
}

/** Rooms a guest can be put in now for [from, to): free or being cleaned, nobody booked. */
export async function freeRoomsFor(db: Db, riadId: string, from: IsoDate, to: IsoDate, exceptStayId?: string) {
  const rooms = await db.room.findMany({
    where: { riadId, isActive: true, status: { in: [...CHECKIN_ROOM_STATUSES] } },
    select: { id: true, name: true, type: true },
    orderBy: { name: 'asc' },
  });
  const free = [];
  for (const room of rooms) {
    if ((await bookingsOverlapping(db, riadId, room.id, from, to, exceptStayId)).length === 0) free.push(room);
  }
  return free;
}

/**
 * Refuses dates that collide with another stay in this room. The error lists the
 * conflicting stay and the rooms free for those dates, so staff can move the guest.
 */
export async function assertRoomBookable(db: Db, riadId: string, roomId: string, from: IsoDate, to: IsoDate, exceptStayId?: string): Promise<void> {
  const [first] = await bookingsOverlapping(db, riadId, roomId, from, to, exceptStayId);
  if (!first) return;
  const guest = first.guests[0];
  const details: RoomBookedDetails = {
    conflict: {
      stayId: first.id,
      guestName: guest ? `${guest.firstName} ${guest.lastName}` : null,
      checkInDate: utcDateToIso(first.checkInDate),
      checkOutDate: utcDateToIso(first.checkOutDate),
    },
    freeRooms: await freeRoomsFor(db, riadId, from, to, exceptStayId),
  };
  throw new AppException('ROOM_BOOKED', 'This room is already booked for some of these nights', HttpStatus.CONFLICT, details);
}
