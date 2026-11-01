import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import {
  addDays,
  atRiadTime,
  CHECKOUT_REMINDER_HOURS,
  isoToUtcDate,
  localDate,
  PERMISSIONS as P,
  TIMEZONE,
  utcDateToIso,
  type CashMovementKind,
  type CashNotificationData,
  type NotificationDto,
  type NotificationListDto,
  type NotificationType,
  type Permission,
  type BackupNotificationData,
  type StayNotificationData,
  type StayNotificationType,
} from '@riad/shared';
import type { AuthPrincipal } from '../common/auth/principal';
import { pageArgs, type PaginationQueryDto } from '../common/pagination';
import { loadUserNames } from '../expenses/expense.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

type StayType = StayNotificationType;
type StayExtra = Pick<StayNotificationData, 'balance' | 'roomNotFree' | 'automatic'>;

/** Who sees each kind of notification (plus `userId`, e.g. a cash box holder). */
const AUDIENCE: Record<NotificationType, Permission> = {
  CHECKIN_REQUEST: P.STAYS_READ, // a guest scanned the QR code: reception confirms
  CHECKIN: P.ROOMS_READ, // housekeeping needs occupancy too (guest names hidden from them)
  CHECKOUT: P.ROOMS_READ, // the room is now to clean
  CHECKOUT_SOON: P.ROOMS_READ,
  CASH: P.EXPENSES_READ_ALL,
  BACKUP: P.SETTINGS_RIAD, // the owner
};

const HOUR_MS = 3_600_000;
const KEEP_DAYS = 90;

const stayInclude = {
  room: { select: { name: true } },
  requestedRoom: { select: { name: true } },
  guests: { where: { isMain: true }, select: { firstName: true, lastName: true }, take: 1 },
} satisfies Prisma.StayInclude;
type StayRow = Prisma.StayGetPayload<{ include: typeof stayInclude }>;

/**
 * The notification center. Sending is best effort: it runs after the change is committed
 * and never makes the action itself fail. Each person has their own read state and never
 * gets notified about what they did themselves.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------

  async stay(type: StayType, riadId: string, stayId: string, actorId: string | null, extra: StayExtra = {}): Promise<void> {
    try {
      const stay = await this.prisma.stay.findFirst({ where: { id: stayId, riadId }, include: stayInclude });
      if (!stay) return;
      await this.create({ riadId, type, actorId, entityId: stayId, data: stayData(stay, extra) });
    } catch (e) {
      this.logger.error(`Notification ${type} for stay ${stayId} failed: ${String(e)}`);
    }
  }

  async cash(riadId: string, walletId: string, actorId: string | null, kind: CashMovementKind, amount: number, note?: string | null): Promise<void> {
    try {
      const wallet = await this.prisma.cashWallet.findFirst({ where: { id: walletId, riadId } });
      if (!wallet) return;
      const data: CashNotificationData = { walletId, walletName: wallet.name, kind, amount, balance: wallet.balance, note: note ?? null };
      await this.create({ riadId, type: 'CASH', actorId, entityId: walletId, userId: wallet.holderId, data });
    } catch (e) {
      this.logger.error(`Cash notification for wallet ${walletId} failed: ${String(e)}`);
    }
  }

  /** Backup failed or too old: the owner of every riad on this server is told, once per key. */
  async backup(data: BackupNotificationData, dedupeKey: string): Promise<number> {
    let sent = 0;
    for (const { id } of await this.prisma.riad.findMany({ select: { id: true } })) {
      if (await this.create({ riadId: id, type: 'BACKUP', actorId: null, data, dedupeKey })) sent++;
    }
    return sent;
  }

  /** "Check-out tomorrow": once per stay and departure date, CHECKOUT_REMINDER_HOURS ahead. */
  @Cron('0 */15 * * * *', { name: 'checkout-reminders', timeZone: TIMEZONE })
  async sendCheckoutReminders(now: Date = new Date()): Promise<number> {
    const today = localDate(now);
    const stays = await this.prisma.stay.findMany({
      where: {
        status: 'CHECKED_IN',
        checkOutDate: { gte: isoToUtcDate(today), lte: isoToUtcDate(addDays(today, 1)) },
      },
      include: { ...stayInclude, riad: { select: { checkoutTime: true } } },
    });
    let sent = 0;
    for (const stay of stays) {
      const out = utcDateToIso(stay.checkOutDate);
      const due = atRiadTime(out, stay.riad.checkoutTime).getTime() - CHECKOUT_REMINDER_HOURS * HOUR_MS;
      if (now.getTime() < due) continue;
      const created = await this.create({
        riadId: stay.riadId,
        type: 'CHECKOUT_SOON',
        actorId: null,
        entityId: stay.id,
        data: stayData(stay),
        dedupeKey: `checkout-soon:${stay.id}:${out}`,
      });
      if (created) sent++;
    }
    return sent;
  }

  @Cron('0 45 3 * * *', { name: 'notification-retention', timeZone: TIMEZONE })
  async purgeOld(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - KEEP_DAYS * 24 * HOUR_MS) } },
    });
    return count;
  }

  private async create(n: {
    riadId: string;
    type: NotificationType;
    actorId: string | null;
    entityId?: string;
    userId?: string;
    data: StayNotificationData | CashNotificationData | BackupNotificationData;
    dedupeKey?: string;
  }): Promise<boolean> {
    try {
      await this.prisma.notification.create({
        data: {
          riadId: n.riadId,
          type: n.type,
          permission: AUDIENCE[n.type],
          userId: n.userId,
          actorId: n.actorId,
          entityId: n.entityId,
          data: n.data as unknown as Prisma.InputJsonObject,
          dedupeKey: n.dedupeKey,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false; // already sent
      throw e;
    }
    this.realtime.notificationsChanged(n.riadId);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  /** What this person may see: by permission or addressed to them, never their own actions. */
  private visible(p: AuthPrincipal): Prisma.NotificationWhereInput {
    return {
      riadId: p.riadId,
      AND: [
        { OR: [{ permission: { in: p.permissions } }, { userId: p.userId }] },
        { OR: [{ actorId: null }, { actorId: { not: p.userId } }] },
      ],
    };
  }

  async list(p: AuthPrincipal, q: PaginationQueryDto & { unread?: boolean }): Promise<NotificationListDto> {
    const base = this.visible(p);
    const unreadWhere: Prisma.NotificationWhereInput = { ...base, reads: { none: { userId: p.userId } } };
    const where = q.unread ? unreadWhere : base;
    const [rows, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        include: { reads: { where: { userId: p.userId }, select: { userId: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(q),
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: unreadWhere }),
    ]);
    const names = await loadUserNames(this.prisma, p.riadId, rows.map((r) => r.actorId));
    const guestNames = p.permissions.includes(P.STAYS_READ);
    const items = rows.map((r) => {
      const data = r.data as Record<string, unknown>;
      return {
        id: r.id,
        type: r.type,
        createdAt: r.createdAt.toISOString(),
        read: r.reads.length > 0,
        actor: (r.actorId && names.get(r.actorId)?.name) || null,
        data: 'guestName' in data && !guestNames ? { ...data, guestName: null } : data,
      } as NotificationDto;
    });
    return { items, total, unread, page: q.page, limit: q.limit };
  }

  /** Marks one notification (or every visible one) as read for this person. */
  async markRead(p: AuthPrincipal, id?: string): Promise<{ unread: number }> {
    const ids = (
      await this.prisma.notification.findMany({
        where: { ...this.visible(p), ...(id ? { id } : {}), reads: { none: { userId: p.userId } } },
        select: { id: true },
      })
    ).map((n) => n.id);
    if (ids.length > 0) {
      await this.prisma.notificationRead.createMany({
        data: ids.map((notificationId) => ({ notificationId, userId: p.userId })),
        skipDuplicates: true,
      });
    }
    const unread = await this.prisma.notification.count({ where: { ...this.visible(p), reads: { none: { userId: p.userId } } } });
    return { unread };
  }
}

function stayData(stay: StayRow, extra: StayExtra = {}): StayNotificationData {
  const guest = stay.guests[0];
  return {
    stayId: stay.id,
    roomName: (stay.room ?? stay.requestedRoom)?.name ?? null,
    guestName: guest ? `${guest.firstName} ${guest.lastName}` : null,
    checkOutDate: utcDateToIso(stay.checkOutDate),
    nights: stay.nights,
    ...(extra.balance ? { balance: extra.balance } : {}),
    ...(extra.roomNotFree ? { roomNotFree: true } : {}),
    ...(extra.automatic ? { automatic: true } : {}),
  };
}
