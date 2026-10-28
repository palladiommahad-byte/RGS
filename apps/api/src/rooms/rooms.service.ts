import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma, Room } from '@prisma/client';
import {
  canSetRoomStatusManually,
  PERMISSIONS,
  type Paginated,
  type RoomDto,
  type RoomStatus,
} from '@riad/shared';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { diffFields } from '../common/diff';
import { pageArgs, paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRoomDto, ListRoomsQueryDto, UpdateRoomDto } from './rooms.dto';

const newQrToken = () => randomBytes(16).toString('base64url');

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(p: AuthPrincipal, q: ListRoomsQueryDto): Promise<Paginated<RoomDto>> {
    const where: Prisma.RoomWhereInput = {
      riadId: p.riadId,
      ...(q.includeInactive ? {} : { isActive: true }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.room.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        ...pageArgs(q),
      }),
      this.prisma.room.count({ where }),
    ]);
    return paginated(
      rows.map((r) => this.toDto(r, p)),
      total,
      q,
    );
  }

  async get(p: AuthPrincipal, id: string): Promise<RoomDto> {
    return this.toDto(await this.findOrThrow(p.riadId, id), p);
  }

  async create(p: AuthPrincipal, dto: CreateRoomDto): Promise<RoomDto> {
    const room = await this.prisma.$transaction(async (tx) => {
      // New rooms go to the end of the board unless an order is given.
      const last = await tx.room.aggregate({ where: { riadId: p.riadId }, _max: { sortOrder: true } });
      const created = await tx.room.create({
        data: {
          ...dto,
          sortOrder: dto.sortOrder ?? (last._max.sortOrder ?? -1) + 1,
          riadId: p.riadId,
          qrToken: newQrToken(),
          createdBy: p.userId,
        },
      });
      await this.audit.log(
        { riadId: p.riadId, userId: p.userId, action: 'room.create', entity: 'Room', entityId: created.id },
        tx,
      );
      return created;
    });
    return this.toDto(room, p);
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateRoomDto): Promise<RoomDto> {
    const before = await this.findOrThrow(p.riadId, id);
    if (dto.isActive === false && before.status === 'OCCUPIED') {
      throw new AppException('ROOM_OCCUPIED', 'Cannot deactivate an occupied room', HttpStatus.CONFLICT);
    }
    const room = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.room.update({ where: { id }, data: dto });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'room.update',
          entity: 'Room',
          entityId: id,
          diff: diffFields(before, dto, ['name', 'type', 'capacity', 'basePrice', 'sortOrder', 'isActive']),
        },
        tx,
      );
      return updated;
    });
    return this.toDto(room, p);
  }

  /** Manual status change (housekeeping). OCCUPIED is only set by the stay lifecycle. */
  async setStatus(p: AuthPrincipal, id: string, status: RoomStatus): Promise<RoomDto> {
    const before = await this.findOrThrow(p.riadId, id);
    if (before.status === status) return this.toDto(before, p);
    if (!canSetRoomStatusManually(before.status, status)) {
      throw new AppException(
        'INVALID_ROOM_STATUS',
        before.status === 'OCCUPIED'
          ? 'An occupied room is freed by checking the guest out'
          : 'OCCUPIED is set by checking a guest in',
        HttpStatus.CONFLICT,
        { from: before.status, to: status },
      );
    }
    const room = await this.prisma.$transaction(async (tx) => {
      // Guard against a concurrent check-in having just occupied the room.
      const { count } = await tx.room.updateMany({
        where: { id, riadId: p.riadId, status: before.status },
        data: { status },
      });
      if (count !== 1) {
        throw new AppException('ROOM_CHANGED', 'Room status changed, reload and retry', HttpStatus.CONFLICT);
      }
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'room.status',
          entity: 'Room',
          entityId: id,
          diff: { status: [before.status, status] },
        },
        tx,
      );
      return tx.room.findUniqueOrThrow({ where: { id } });
    });
    return this.toDto(room, p);
  }

  /** Invalidates the printed QR code of a room (e.g. if it was photographed and misused). */
  async regenerateQr(p: AuthPrincipal, id: string): Promise<RoomDto> {
    await this.findOrThrow(p.riadId, id);
    const room = await this.prisma.room.update({ where: { id }, data: { qrToken: newQrToken() } });
    await this.audit.log({
      riadId: p.riadId,
      userId: p.userId,
      action: 'room.qr_regenerate',
      entity: 'Room',
      entityId: id,
    });
    return this.toDto(room, p);
  }

  /** Deletes a room that never had a stay; otherwise deactivates it to keep history. */
  async remove(p: AuthPrincipal, id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
    const room = await this.findOrThrow(p.riadId, id);
    if (room.status === 'OCCUPIED') {
      throw new AppException('ROOM_OCCUPIED', 'Cannot delete an occupied room', HttpStatus.CONFLICT);
    }
    const stays = await this.prisma.stay.count({
      where: { riadId: p.riadId, OR: [{ roomId: id }, { requestedRoomId: id }] },
    });
    return this.prisma.$transaction(async (tx) => {
      if (stays > 0) await tx.room.update({ where: { id }, data: { isActive: false } });
      else await tx.room.delete({ where: { id } });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: stays > 0 ? 'room.deactivate' : 'room.delete',
          entity: 'Room',
          entityId: id,
          diff: { name: room.name },
        },
        tx,
      );
      return { deleted: stays === 0, deactivated: stays > 0 };
    });
  }

  async checkinLinks(p: AuthPrincipal): Promise<{ entranceKey: string }> {
    const riad = await this.prisma.riad.findUniqueOrThrow({ where: { id: p.riadId }, select: { checkinKey: true } });
    return { entranceKey: riad.checkinKey };
  }

  async findOrThrow(riadId: string, id: string): Promise<Room> {
    const room = await this.prisma.room.findFirst({ where: { id, riadId } });
    if (!room) throw new AppException('NOT_FOUND', 'Room not found', HttpStatus.NOT_FOUND);
    return room;
  }

  private toDto(r: Room, p: AuthPrincipal): RoomDto {
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      capacity: r.capacity,
      basePrice: r.basePrice,
      status: r.status,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      ...(p.permissions.includes(PERMISSIONS.ROOMS_WRITE) ? { qrToken: r.qrToken } : {}),
    };
  }
}
