import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Riad, Room } from '@prisma/client';
import {
  accommodationTotal,
  CHECKIN_ALLOWED_IMAGE_TYPES,
  CHECKIN_ROOM_STATUSES,
  isoToUtcDate,
  nightsBetween,
  todayIso,
  type CheckinContextDto,
  type CheckinDoneDto,
  type PassportScanDto,
} from '@riad/shared';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { FieldEncryption } from '../common/crypto/field-encryption';
import { env } from '../config/env';
import { PassportReaderService } from '../ocr/passport-reader.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { StorageService } from '../storage/storage.service';
import { guestCreateData } from '../stays/guest-data';
import { bookingsOverlapping } from '../stays/room-availability';
import { staySummaryInclude, toStaySummary } from '../stays/stay.mapper';
import type { CheckinLinkDto, CheckinSubmitDto } from './checkin.dto';

type CheckinContext = { riad: Riad; room: Room };

const MAX_NIGHTS = 365;
export const PENDING_PREFIX = 'pending/';

/** Guest self check-in: no login, the QR token is the only credential. */
@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly reader: PassportReaderService,
    private readonly enc: FieldEncryption,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async context(link: CheckinLinkDto): Promise<CheckinContextDto> {
    const { riad, room } = await this.resolve(link);
    return {
      riadName: riad.name,
      roomName: room?.name ?? null,
      contactEmail: riad.email,
      retentionDays: env().PASSPORT_IMAGE_RETENTION_DAYS,
    };
  }

  /**
   * Stores the photo under pending/ (cleaned after 24 h unless the check-in is submitted)
   * and returns whatever the MRZ reader found. The guest always reviews the fields.
   */
  async scanPassport(link: CheckinLinkDto, file: Express.Multer.File | undefined): Promise<PassportScanDto> {
    const { riad } = await this.resolve(link);
    if (!file || !(CHECKIN_ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new AppException('UNSUPPORTED_IMAGE', 'Send a JPEG, PNG or WebP photo');
    }
    let normalised: Buffer;
    try {
      // Re-encode: applies EXIF rotation, strips metadata (GPS…), caps the size.
      normalised = await sharp(file.buffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new AppException('UNSUPPORTED_IMAGE', 'This image could not be read');
    }
    const id = randomUUID();
    await this.storage.put('passports', `${PENDING_PREFIX}${riad.id}/${id}.jpg`, normalised, 'image/jpeg');
    const mrz = await this.reader.read(normalised);
    return {
      photoRef: `${id}.${this.sign(riad.id, id)}`,
      mrz: mrz ? { valid: mrz.valid, raw: mrz.raw, fields: mrz.fields } : null,
    };
  }

  async submit(link: CheckinLinkDto, dto: CheckinSubmitDto): Promise<CheckinDoneDto> {
    // Honeypot filled: answer like a success so the bot learns nothing.
    if (dto.website) return { riadName: '', wifiInfo: null, checkedIn: false, roomName: null };

    const { riad, room } = await this.resolve(link);
    const today = todayIso();
    const nights = nightsBetween(today, dto.checkOutDate);
    if (nights < 1 || nights > MAX_NIGHTS) {
      throw new AppException('INVALID_DATES', 'The departure date must be after today');
    }
    if (dto.guests.length > dto.adults) {
      throw new AppException('TOO_MANY_GUESTS', 'More guest documents than adults');
    }
    const photoIds = dto.guests.map((g) => (g.photoRef ? this.verifyPhotoRef(riad.id, g.photoRef) : null));
    const signature = await this.decodeSignature(dto.signature);

    const stayId = randomUUID();
    const guestIds = dto.guests.map(() => randomUUID());
    const base = `riads/${riad.id}/stays/${stayId}`;
    const signatureKey = `${base}/signature.png`;
    const photoKeys = photoIds.map((pid, i) => (pid ? `${base}/${guestIds[i]}-passport.jpg` : null));

    // Files first: if the database write fails we delete them; the reverse would leave
    // a stay pointing at missing files.
    await this.storage.put('passports', signatureKey, signature, 'image/png');
    try {
      for (const [i, pid] of photoIds.entries()) {
        if (pid) await this.storage.copy('passports', `${PENDING_PREFIX}${riad.id}/${pid}.jpg`, photoKeys[i]!);
      }
    } catch {
      await this.storage.delete('passports', [signatureKey, ...photoKeys]);
      throw new AppException('PHOTO_EXPIRED', 'A passport photo expired, please take it again', HttpStatus.GONE);
    }

    const consentAt = new Date();
    let checkedIn = false;
    try {
      checkedIn = await this.prisma.$transaction(async (tx) => {
        // The QR code says which room: the guest is checked in at once when it is free
        // (free or being cleaned, nobody booked for these nights). Otherwise reception decides.
        const bookable =
          (CHECKIN_ROOM_STATUSES as readonly string[]).includes(room.status) &&
          (await bookingsOverlapping(tx, riad.id, room.id, today, dto.checkOutDate)).length === 0;
        const taken =
          bookable &&
          (
            await tx.room.updateMany({
              where: { id: room.id, riadId: riad.id, isActive: true, status: { in: [...CHECKIN_ROOM_STATUSES] } },
              data: { status: 'OCCUPIED' },
            })
          ).count === 1;
        await tx.stay.create({
          data: {
            id: stayId,
            riadId: riad.id,
            ...(taken
              ? {
                  status: 'CHECKED_IN',
                  roomId: room.id,
                  source: 'DIRECT',
                  pricePerNight: room.basePrice,
                  totalAccommodation: accommodationTotal(room.basePrice, nights),
                  confirmedAt: consentAt,
                }
              : { requestedRoomId: room.id, source: 'OTHER' }),
            checkInDate: isoToUtcDate(today),
            checkOutDate: isoToUtcDate(dto.checkOutDate),
            nights,
            adults: dto.adults,
            children: dto.children,
            guests: {
              create: dto.guests.map((g, i) => ({
                ...guestCreateData(this.enc, riad.id, g),
                id: guestIds[i],
                isMain: i === 0,
                phone: i === 0 ? dto.phone : g.phone,
                email: i === 0 ? dto.email : g.email,
                passportPhotoKey: photoKeys[i],
                signatureKey: i === 0 ? signatureKey : null,
                consentAt,
                mrzRaw: g.mrzRaw,
              })),
            },
          },
        });
        await this.audit.log(
          {
            riadId: riad.id,
            userId: null,
            action: 'stay.self_checkin',
            entity: 'Stay',
            entityId: stayId,
            diff: { guests: dto.guests.length, roomId: room.id, locale: dto.locale, checkedIn: taken },
          },
          tx,
        );
        return taken;
      });
    } catch (e) {
      await this.storage.delete('passports', [signatureKey, ...photoKeys]);
      throw e;
    }

    await this.storage.delete(
      'passports',
      photoIds.map((pid) => (pid ? `${PENDING_PREFIX}${riad.id}/${pid}.jpg` : null)),
    );
    if (checkedIn) {
      this.realtime.staysChanged(riad.id);
      this.realtime.roomsChanged(riad.id);
      await this.notifications.stay('CHECKIN', riad.id, stayId, null);
    } else {
      // Room occupied, out of service or booked: reception picks a room and confirms.
      const stay = await this.prisma.stay.findUniqueOrThrow({ where: { id: stayId }, include: staySummaryInclude });
      this.realtime.emitToRiad(riad.id, 'checkin:new', toStaySummary(stay));
      await this.notifications.stay('CHECKIN_REQUEST', riad.id, stayId, null, { roomNotFree: true });
    }
    return { riadName: riad.name, wifiInfo: riad.wifiInfo, checkedIn, roomName: room.name };
  }

  /** The room QR code tells which room (and riad) the guest is checking into. */
  private async resolve(link: CheckinLinkDto): Promise<CheckinContext> {
    const room = await this.prisma.room.findFirst({
      where: { qrToken: link.room, isActive: true },
      include: { riad: true },
    });
    if (!room) throw new AppException('INVALID_CHECKIN_LINK', 'This check-in link is not valid', HttpStatus.NOT_FOUND);
    const { riad, ...plain } = room;
    return { riad, room: plain };
  }

  /** photoRef = "<uuid>.<hmac>": proves the photo was uploaded through this riad's link. */
  private sign(riadId: string, id: string): string {
    return createHmac('sha256', env().FIELD_HASH_KEY).update(`photo:${riadId}:${id}`).digest('base64url');
  }

  private verifyPhotoRef(riadId: string, ref: string): string {
    const [id, mac] = ref.split('.');
    const ok =
      id &&
      mac &&
      /^[0-9a-f-]{36}$/.test(id) &&
      mac.length === this.sign(riadId, id).length &&
      timingSafeEqual(Buffer.from(mac), Buffer.from(this.sign(riadId, id)));
    if (!ok) throw new AppException('INVALID_PHOTO', 'Invalid passport photo reference');
    return id;
  }

  private async decodeSignature(dataUrl: string): Promise<Buffer> {
    try {
      const raw = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      const meta = await sharp(raw).metadata();
      if (meta.format !== 'png' || !meta.width || !meta.height) throw new Error('not a png');
      return await sharp(raw).png().toBuffer(); // re-encode: drops anything but pixels
    } catch {
      throw new AppException('INVALID_SIGNATURE', 'The signature could not be read');
    }
  }
}
