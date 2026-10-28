import type { Guest, Prisma } from '@prisma/client';
import {
  utcDateToIso,
  type DocumentType,
  type GuestDto,
  type Sex,
  type StayDetailDto,
  type StaySummaryDto,
} from '@riad/shared';
import type { FieldEncryption } from '../common/crypto/field-encryption';

export const staySummaryInclude = {
  room: { select: { id: true, name: true } },
  requestedRoom: { select: { id: true, name: true } },
  guests: {
    where: { isMain: true },
    select: { firstName: true, lastName: true, nationality: true },
    take: 1,
  },
  _count: { select: { guests: true } },
} satisfies Prisma.StayInclude;

export const stayDetailInclude = {
  room: { select: { id: true, name: true } },
  requestedRoom: { select: { id: true, name: true } },
  guests: { orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }] },
  _count: { select: { guests: true } },
} satisfies Prisma.StayInclude;

type StaySummaryRow = Prisma.StayGetPayload<{ include: typeof staySummaryInclude }>;
type StayDetailRow = Prisma.StayGetPayload<{ include: typeof stayDetailInclude }>;

const iso = (d: Date | null): string | null => (d ? utcDateToIso(d) : null);

function base(s: StaySummaryRow | StayDetailRow): Omit<StaySummaryDto, 'mainGuest'> {
  return {
    id: s.id,
    status: s.status,
    source: s.source,
    externalRef: s.externalRef,
    checkInDate: utcDateToIso(s.checkInDate),
    checkOutDate: utcDateToIso(s.checkOutDate),
    nights: s.nights,
    adults: s.adults,
    children: s.children,
    pricePerNight: s.pricePerNight,
    totalAccommodation: s.totalAccommodation,
    room: s.room,
    requestedRoom: s.requestedRoom,
    guestCount: s._count.guests,
    createdAt: s.createdAt.toISOString(),
  };
}

export function toStaySummary(s: StaySummaryRow): StaySummaryDto {
  const main = s.guests[0];
  return { ...base(s), mainGuest: main ?? null };
}

export function toGuestDto(g: Guest, enc: FieldEncryption): GuestDto {
  return {
    id: g.id,
    isMain: g.isMain,
    firstName: g.firstName,
    lastName: g.lastName,
    sex: g.sex as Sex | null,
    nationality: g.nationality,
    birthDate: iso(g.birthDate),
    documentType: g.documentType as DocumentType | null,
    documentNumber: g.documentNumber ? enc.decrypt(g.documentNumber) : null,
    documentExpiry: iso(g.documentExpiry),
    phone: g.phone,
    email: g.email,
    hasPassportPhoto: Boolean(g.passportPhotoKey),
    consentAt: g.consentAt?.toISOString() ?? null,
  };
}

export function toStayDetail(
  s: StayDetailRow,
  confirmedBy: { id: string; name: string } | null,
  enc: FieldEncryption,
): StayDetailDto {
  const main = s.guests.find((g) => g.isMain);
  return {
    ...base(s),
    mainGuest: main
      ? { firstName: main.firstName, lastName: main.lastName, nationality: main.nationality }
      : null,
    otaCommission: s.otaCommission,
    notes: s.notes,
    confirmedAt: s.confirmedAt?.toISOString() ?? null,
    confirmedBy,
    checkedOutAt: s.checkedOutAt?.toISOString() ?? null,
    guests: s.guests.map((g) => toGuestDto(g, enc)),
  };
}
