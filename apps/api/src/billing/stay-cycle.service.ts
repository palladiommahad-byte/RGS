import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { atRiadTime, isoToUtcDate, localDate, TIMEZONE, utcDateToIso } from '@riad/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { BillingService } from './billing.service';

/**
 * The automatic end of a stay, on each riad's own clock (Settings):
 * - at the check-out time of the departure day, guests still in are checked out
 *   (invoice issued, balance still due flagged) and their room goes « to clean »;
 * - at the room-ready time, rooms still « to clean » become free again.
 * Runs every 5 minutes, so it also catches up after the server was down. Staff can always
 * do either earlier by hand; out-of-service rooms are never touched.
 */
@Injectable()
export class StayCycleService {
  private readonly logger = new Logger(StayCycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Cron('0 */5 * * * *', { name: 'stay-cycle', timeZone: TIMEZONE })
  async run(now: Date = new Date()): Promise<void> {
    await this.checkOutEndedStays(now);
    await this.freeCleanedRooms(now);
  }

  async checkOutEndedStays(now: Date = new Date()): Promise<number> {
    const stays = await this.prisma.stay.findMany({
      where: { status: 'CHECKED_IN', checkOutDate: { lte: isoToUtcDate(localDate(now)) } },
      select: { id: true, riadId: true, checkOutDate: true, riad: { select: { checkoutTime: true } } },
      orderBy: { checkOutDate: 'asc' },
    });
    let done = 0;
    for (const s of stays) {
      if (now < atRiadTime(utcDateToIso(s.checkOutDate), s.riad.checkoutTime)) continue;
      try {
        await this.billing.checkout({ riadId: s.riadId, userId: null }, s.id, { acceptBalanceDue: true }, { automatic: true });
        done++;
      } catch (e) {
        // e.g. staff checked the guest out at the same moment: nothing left to do.
        this.logger.warn(`Automatic check-out of stay ${s.id} skipped: ${String(e)}`);
      }
    }
    if (done) this.logger.log(`Automatic check-out: ${done} stay(s)`);
    return done;
  }

  async freeCleanedRooms(now: Date = new Date()): Promise<number> {
    const riads = await this.prisma.riad.findMany({ select: { id: true, roomReadyTime: true } });
    let total = 0;
    for (const riad of riads) {
      const readyAt = atRiadTime(localDate(now), riad.roomReadyTime);
      if (now < readyAt) continue;
      // Only rooms that were already « to clean » before today's ready time: a room
      // freed at 16:00 is cleaned for tomorrow's.
      const rooms = await this.prisma.room.findMany({
        where: { riadId: riad.id, status: 'CLEANING', updatedAt: { lt: readyAt } },
        select: { id: true },
      });
      let freed = 0;
      for (const room of rooms) {
        await this.prisma.$transaction(async (tx) => {
          const { count } = await tx.room.updateMany({ where: { id: room.id, status: 'CLEANING' }, data: { status: 'FREE' } });
          if (count !== 1) return; // changed meanwhile (housekeeping, check-in…)
          freed++;
          await this.audit.log(
            { riadId: riad.id, userId: null, action: 'room.status', entity: 'Room', entityId: room.id, diff: { status: ['CLEANING', 'FREE'], automatic: true } },
            tx,
          );
        });
      }
      if (freed) this.realtime.roomsChanged(riad.id);
      total += freed;
    }
    if (total) this.logger.log(`Rooms ready: ${total}`);
    return total;
  }
}
