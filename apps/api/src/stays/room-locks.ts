import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CHECKIN_ROOM_STATUSES } from '@riad/shared';
import { AppException } from '../common/app-exception';

type Tx = Prisma.TransactionClient;

/** Atomically takes a free/cleaning room. Fails if someone else just took it. */
export async function occupyRoom(tx: Tx, riadId: string, roomId: string): Promise<void> {
  const { count } = await tx.room.updateMany({
    where: { id: roomId, riadId, isActive: true, status: { in: [...CHECKIN_ROOM_STATUSES] } },
    data: { status: 'OCCUPIED' },
  });
  if (count !== 1) {
    throw new AppException('ROOM_NOT_AVAILABLE', 'This room is occupied or out of service', HttpStatus.CONFLICT);
  }
}

/** The guest left: the room needs cleaning before the next arrival. */
export async function releaseRoom(tx: Tx, riadId: string, roomId: string): Promise<void> {
  await tx.room.updateMany({
    where: { id: roomId, riadId, status: 'OCCUPIED' },
    data: { status: 'CLEANING' },
  });
}
