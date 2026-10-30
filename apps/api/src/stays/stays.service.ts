import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Stay } from '@prisma/client';
import {
  accommodationTotal,
  isoToUtcDate,
  nightsBetween,
  PERMISSIONS,
  todayIso,
  utcDateToIso,
  type GuestDto,
  type GuestFilesDto,
  type Paginated,
  type StayDetailDto,
  type StayStatus,
  type StaySummaryDto,
  type TodayDto,
} from '@riad/shared';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { FieldEncryption } from '../common/crypto/field-encryption';
import { diffFields } from '../common/diff';
import { pageArgs, paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { guestCreateData, guestUpdateData } from './guest-data';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { occupyRoom, releaseRoom } from './room-locks';
import { stayDetailInclude, staySummaryInclude, toGuestDto, toStayDetail, toStaySummary } from './stay.mapper';
import type {
  ConfirmStayDto,
  CreateStayDto,
  GuestInputDto,
  ListStaysQueryDto,
  UpdateGuestDto,
  UpdateStayDto,
} from './stays.dto';

type Tx = Prisma.TransactionClient;

const MAX_NIGHTS = 365;
const EDITABLE: readonly StayStatus[] = ['PENDING', 'CHECKED_IN'];
const STAY_AUDIT_FIELDS = [
  'source',
  'externalRef',
  'checkInDate',
  'checkOutDate',
  'nights',
  'adults',
  'children',
  'pricePerNight',
  'totalAccommodation',
  'otaCommission',
  'roomId',
  'requestedRoomId',
  'notes',
] as const satisfies readonly (keyof Stay)[];

@Injectable()
export class StaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly enc: FieldEncryption,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Open dashboards reload: stays and room statuses may both have changed. */
  private notify(riadId: string): void {
    this.realtime.staysChanged(riadId);
    this.realtime.roomsChanged(riadId);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async list(p: AuthPrincipal, q: ListStaysQueryDto): Promise<Paginated<StaySummaryDto>> {
    const where: Prisma.StayWhereInput = { riadId: p.riadId };
    if (q.status) where.status = q.status;
    if (q.from) where.checkOutDate = { gt: isoToUtcDate(q.from) };
    if (q.to) where.checkInDate = { lt: isoToUtcDate(q.to) };
    // A guest's QR check-in only has the room they asked for until reception confirms it.
    if (q.roomId) where.AND = [{ OR: [{ roomId: q.roomId }, { roomId: null, requestedRoomId: q.roomId }] }];
    if (q.search) {
      const contains = { contains: q.search, mode: Prisma.QueryMode.insensitive };
      where.OR = [
        { externalRef: contains },
        { guests: { some: { OR: [{ firstName: contains }, { lastName: contains }] } } },
      ];
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stay.findMany({
        where,
        include: staySummaryInclude,
        orderBy: [{ checkInDate: 'desc' }, { createdAt: 'desc' }],
        ...pageArgs(q),
      }),
      this.prisma.stay.count({ where }),
    ]);
    return paginated(rows.map(toStaySummary), total, q);
  }

  async get(p: AuthPrincipal, id: string): Promise<StayDetailDto> {
    const stay = await this.prisma.stay.findFirst({
      where: { id, riadId: p.riadId },
      include: stayDetailInclude,
    });
    if (!stay) throw notFound('Stay');
    // Names of the staff who confirmed the stay and received payments.
    const userIds = [stay.confirmedBy, ...stay.payments.map((pm) => pm.receivedBy)].filter((x): x is string => !!x);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] }, riadId: p.riadId },
      select: { id: true, name: true },
    });
    return toStayDetail(stay, new Map(users.map((u) => [u.id, u])), this.enc);
  }

  /** Data for the reception "Today" screen, in the riad's timezone. */
  async today(p: AuthPrincipal): Promise<TodayDto> {
    const date = todayIso();
    const [pending, inHouse, roomGroups] = await Promise.all([
      this.prisma.stay.findMany({
        where: { riadId: p.riadId, status: 'PENDING' },
        include: staySummaryInclude,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.stay.findMany({
        where: { riadId: p.riadId, status: 'CHECKED_IN' },
        include: staySummaryInclude,
        orderBy: [{ checkOutDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.room.groupBy({
        by: ['status'],
        where: { riadId: p.riadId, isActive: true },
        _count: { _all: true },
      }),
    ]);
    const countOf = (s: string) => roomGroups.find((g) => g.status === s)?._count._all ?? 0;
    const inHouseDto = inHouse.map(toStaySummary);
    return {
      date,
      pending: pending.map(toStaySummary),
      arrivals: inHouseDto.filter((s) => s.checkInDate === date),
      // Includes overdue departures (should have left before today).
      departures: inHouseDto.filter((s) => s.checkOutDate <= date),
      inHouse: inHouseDto,
      rooms: {
        total: roomGroups.reduce((n, g) => n + g._count._all, 0),
        occupied: countOf('OCCUPIED'),
        free: countOf('FREE'),
        cleaning: countOf('CLEANING'),
        outOfService: countOf('OUT_OF_SERVICE'),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Staff-created stay (walk-in, guest without a phone…). Optionally checked in at once. */
  async create(p: AuthPrincipal, dto: CreateStayDto): Promise<StayDetailDto> {
    const nights = nightsOrThrow(dto.checkInDate, dto.checkOutDate);
    if (dto.checkInNow) {
      if (!p.permissions.includes(PERMISSIONS.CHECKIN_CONFIRM)) {
        throw new AppException('FORBIDDEN', 'Missing permission', HttpStatus.FORBIDDEN, {
          required: [PERMISSIONS.CHECKIN_CONFIRM],
        });
      }
      if (!dto.roomId) throw new AppException('ROOM_REQUIRED', 'A room is required to check in');
    }
    if (dto.roomId) await this.assertRoomInRiad(p.riadId, dto.roomId);

    const id = await this.prisma.$transaction(async (tx) => {
      const stay = await tx.stay.create({
        data: {
          riadId: p.riadId,
          source: dto.source,
          externalRef: dto.externalRef,
          checkInDate: isoToUtcDate(dto.checkInDate),
          checkOutDate: isoToUtcDate(dto.checkOutDate),
          nights,
          adults: dto.adults,
          children: dto.children,
          pricePerNight: dto.pricePerNight,
          totalAccommodation: accommodationTotal(dto.pricePerNight, nights),
          otaCommission: dto.otaCommission ?? 0,
          notes: dto.notes,
          createdBy: p.userId,
          ...(dto.checkInNow
            ? { roomId: dto.roomId, status: 'CHECKED_IN', confirmedBy: p.userId, confirmedAt: new Date() }
            : { requestedRoomId: dto.roomId }),
          guests: {
            create: {
              ...guestCreateData(this.enc, p.riadId, dto.mainGuest),
              isMain: true,
            },
          },
        },
      });
      if (dto.checkInNow) await occupyRoom(tx, p.riadId, dto.roomId!);
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: dto.checkInNow ? 'stay.create_checked_in' : 'stay.create',
          entity: 'Stay',
          entityId: stay.id,
          diff: { status: stay.status, roomId: stay.roomId ?? stay.requestedRoomId, nights },
        },
        tx,
      );
      return stay.id;
    });
    this.notify(p.riadId);
    return this.get(p, id);
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateStayDto): Promise<StayDetailDto> {
    const before = await this.findOrThrow(p.riadId, id);
    if (!EDITABLE.includes(before.status)) throw stayLocked(before.status);
    const checkIn = dto.checkInDate ?? utcDateToIso(before.checkInDate);
    const checkOut = dto.checkOutDate ?? utcDateToIso(before.checkOutDate);
    const nights = nightsOrThrow(checkIn, checkOut);
    const pricePerNight = dto.pricePerNight ?? before.pricePerNight;

    const data: Prisma.StayUncheckedUpdateInput = {
      source: dto.source,
      externalRef: dto.externalRef,
      checkInDate: isoToUtcDate(checkIn),
      checkOutDate: isoToUtcDate(checkOut),
      nights,
      adults: dto.adults,
      children: dto.children,
      pricePerNight,
      totalAccommodation: accommodationTotal(pricePerNight, nights),
      otaCommission: dto.otaCommission,
      notes: dto.notes,
    };

    const moveRoom =
      before.status === 'CHECKED_IN' && dto.roomId !== undefined && dto.roomId !== before.roomId;
    if (dto.roomId) await this.assertRoomInRiad(p.riadId, dto.roomId);
    if (before.status === 'PENDING' && dto.roomId !== undefined) data.requestedRoomId = dto.roomId;
    if (moveRoom) data.roomId = dto.roomId;

    await this.prisma.$transaction(async (tx) => {
      const after = await tx.stay.update({ where: { id }, data });
      if (moveRoom) {
        await occupyRoom(tx, p.riadId, dto.roomId!);
        if (before.roomId) await releaseRoom(tx, p.riadId, before.roomId);
      }
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: moveRoom ? 'stay.update_room_move' : 'stay.update',
          entity: 'Stay',
          entityId: id,
          diff: diffFields(before, after, STAY_AUDIT_FIELDS),
        },
        tx,
      );
    });
    this.notify(p.riadId);
    return this.get(p, id);
  }

  /** PENDING -> CHECKED_IN: staff verified the guest, assigned a room and a price. */
  async confirm(p: AuthPrincipal, id: string, dto: ConfirmStayDto): Promise<StayDetailDto> {
    const before = await this.findOrThrow(p.riadId, id);
    assertStatus(before, 'PENDING', 'CHECKED_IN');
    await this.assertRoomInRiad(p.riadId, dto.roomId);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.stay.updateMany({
        where: { id, riadId: p.riadId, status: 'PENDING' },
        data: {
          status: 'CHECKED_IN',
          roomId: dto.roomId,
          source: dto.source,
          externalRef: dto.externalRef,
          pricePerNight: dto.pricePerNight,
          totalAccommodation: accommodationTotal(dto.pricePerNight, before.nights),
          otaCommission: dto.otaCommission ?? 0,
          confirmedBy: p.userId,
          confirmedAt: new Date(),
        },
      });
      if (count !== 1) throw changedConcurrently();
      await occupyRoom(tx, p.riadId, dto.roomId);
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'stay.confirm',
          entity: 'Stay',
          entityId: id,
          diff: {
            status: ['PENDING', 'CHECKED_IN'],
            roomId: dto.roomId,
            pricePerNight: dto.pricePerNight,
            source: dto.source,
          },
        },
        tx,
      );
    });
    this.notify(p.riadId);
    return this.get(p, id);
  }

  /** PENDING -> CANCELLED (no-show, duplicate). Checked-in guests are checked out instead. */
  async cancel(p: AuthPrincipal, id: string): Promise<StayDetailDto> {
    const before = await this.findOrThrow(p.riadId, id);
    assertStatus(before, 'PENDING', 'CANCELLED');
    await this.transition(p, id, 'PENDING', { status: 'CANCELLED' }, 'stay.cancel');
    this.notify(p.riadId);
    return this.get(p, id);
  }

  // ---------------------------------------------------------------------------
  // Guests
  // ---------------------------------------------------------------------------

  async addGuest(p: AuthPrincipal, stayId: string, dto: GuestInputDto): Promise<GuestDto> {
    const stay = await this.findOrThrow(p.riadId, stayId);
    if (stay.status === 'CANCELLED') throw stayLocked(stay.status);
    const guest = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guest.create({
        data: { ...guestCreateData(this.enc, p.riadId, dto), stayId, isMain: false },
      });
      await this.audit.log(
        { riadId: p.riadId, userId: p.userId, action: 'guest.create', entity: 'Guest', entityId: created.id, diff: { stayId } },
        tx,
      );
      return created;
    });
    return toGuestDto(guest, this.enc);
  }

  async updateGuest(p: AuthPrincipal, stayId: string, guestId: string, dto: UpdateGuestDto): Promise<GuestDto> {
    await this.findGuestOrThrow(p.riadId, stayId, guestId);
    const data = guestUpdateData(this.enc, dto);
    const guest = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.guest.update({ where: { id: guestId }, data });
      // Field names only: the audit log must never hold plaintext document numbers.
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'guest.update',
          entity: 'Guest',
          entityId: guestId,
          diff: { stayId, fields: Object.keys(data).filter((k) => k !== 'documentNumberHash') },
        },
        tx,
      );
      return updated;
    });
    return toGuestDto(guest, this.enc);
  }

  async removeGuest(p: AuthPrincipal, stayId: string, guestId: string): Promise<void> {
    const guest = await this.findGuestOrThrow(p.riadId, stayId, guestId);
    if (guest.isMain) {
      throw new AppException('MAIN_GUEST', 'The main guest cannot be removed', HttpStatus.CONFLICT);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.guest.delete({ where: { id: guestId } });
      await this.audit.log(
        { riadId: p.riadId, userId: p.userId, action: 'guest.delete', entity: 'Guest', entityId: guestId, diff: { stayId } },
        tx,
      );
    });
    await this.storage.delete('passports', [guest.passportPhotoKey, guest.signatureKey]);
  }

  /**
   * Rejects a self check-in (spam, wrong riad, duplicate): the stay, its guests and their
   * passport photos and signature are deleted. Only the audit entry remains.
   */
  async reject(p: AuthPrincipal, id: string): Promise<void> {
    const stay = await this.prisma.stay.findFirst({
      where: { id, riadId: p.riadId },
      include: { guests: { select: { passportPhotoKey: true, signatureKey: true } } },
    });
    if (!stay) throw notFound('Stay');
    if (stay.status !== 'PENDING') {
      throw new AppException('INVALID_TRANSITION', 'Only a pending check-in can be rejected', HttpStatus.CONFLICT, {
        from: stay.status,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.stay.deleteMany({ where: { id, riadId: p.riadId, status: 'PENDING' } });
      if (count !== 1) throw changedConcurrently();
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'stay.reject',
          entity: 'Stay',
          entityId: id,
          diff: { guests: stay.guests.length },
        },
        tx,
      );
    });
    await this.storage.delete(
      'passports',
      stay.guests.flatMap((g) => [g.passportPhotoKey, g.signatureKey]),
    );
    this.notify(p.riadId);
  }

  /** 5-minute signed URLs so staff can compare the passport photo with the typed data. */
  async guestFiles(p: AuthPrincipal, stayId: string, guestId: string): Promise<GuestFilesDto> {
    const guest = await this.findGuestOrThrow(p.riadId, stayId, guestId);
    const [passportPhotoUrl, signatureUrl] = await Promise.all([
      guest.passportPhotoKey ? this.storage.signedUrl('passports', guest.passportPhotoKey) : null,
      guest.signatureKey ? this.storage.signedUrl('passports', guest.signatureKey) : null,
    ]);
    if (passportPhotoUrl) {
      await this.audit.log({
        riadId: p.riadId,
        userId: p.userId,
        action: 'guest.passport_view',
        entity: 'Guest',
        entityId: guestId,
      });
    }
    return { passportPhotoUrl, signatureUrl };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async transition(
    p: AuthPrincipal,
    id: string,
    from: StayStatus,
    data: Prisma.StayUpdateManyMutationInput,
    action: string,
    sideEffects?: (tx: Tx) => Promise<void>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.stay.updateMany({ where: { id, riadId: p.riadId, status: from }, data });
      if (count !== 1) throw changedConcurrently();
      await sideEffects?.(tx);
      await this.audit.log(
        { riadId: p.riadId, userId: p.userId, action, entity: 'Stay', entityId: id, diff: { status: [from, data.status as string] } },
        tx,
      );
    });
  }

  private async findOrThrow(riadId: string, id: string): Promise<Stay> {
    const stay = await this.prisma.stay.findFirst({ where: { id, riadId } });
    if (!stay) throw notFound('Stay');
    return stay;
  }

  private async findGuestOrThrow(riadId: string, stayId: string, guestId: string) {
    const guest = await this.prisma.guest.findFirst({ where: { id: guestId, stayId, riadId } });
    if (!guest) throw notFound('Guest');
    return guest;
  }

  private async assertRoomInRiad(riadId: string, roomId: string): Promise<void> {
    const room = await this.prisma.room.findFirst({ where: { id: roomId, riadId, isActive: true } });
    if (!room) throw notFound('Room');
  }
}

// -----------------------------------------------------------------------------

function nightsOrThrow(checkIn: string, checkOut: string): number {
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) {
    throw new AppException('INVALID_DATES', 'Check-out must be after check-in', HttpStatus.BAD_REQUEST);
  }
  if (nights > MAX_NIGHTS) {
    throw new AppException('INVALID_DATES', `A stay cannot exceed ${MAX_NIGHTS} nights`, HttpStatus.BAD_REQUEST);
  }
  return nights;
}

function assertStatus(stay: Stay, expected: StayStatus, to: StayStatus): void {
  if (stay.status !== expected) {
    throw new AppException('INVALID_TRANSITION', `Cannot go from ${stay.status} to ${to}`, HttpStatus.CONFLICT, {
      from: stay.status,
      to,
    });
  }
}

const notFound = (what: string) => new AppException('NOT_FOUND', `${what} not found`, HttpStatus.NOT_FOUND);
const stayLocked = (status: StayStatus) =>
  new AppException('STAY_LOCKED', `A ${status} stay can no longer be edited`, HttpStatus.CONFLICT);
const changedConcurrently = () =>
  new AppException('STAY_CHANGED', 'This stay was changed by someone else, reload and retry', HttpStatus.CONFLICT);
