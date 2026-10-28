import { z } from 'zod';
import {
  DOCUMENT_TYPES,
  SEXES,
  STAY_SOURCES,
  type DocumentType,
  type Sex,
  type StaySource,
  type StayStatus,
} from '../constants';
import { isIsoDate, type IsoDate } from '../dates';
import type { InvoiceSummaryDto, PaymentDto, StayExtraDto } from './billing';

const isoDate = z.string().refine(isIsoDate, 'invalid_date');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const madAmount = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d{1,2})?$/, 'invalid_amount');

export const guestFormSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  sex: z.enum(SEXES).optional(),
  nationality: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'invalid_nationality')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  birthDate: isoDate.optional().or(z.literal('').transform(() => undefined)),
  documentType: z.enum(DOCUMENT_TYPES).optional(),
  documentNumber: optionalText(40),
  documentExpiry: isoDate.optional().or(z.literal('').transform(() => undefined)),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type GuestFormInput = z.infer<typeof guestFormSchema>;

export const stayFormSchema = z
  .object({
    source: z.enum(STAY_SOURCES),
    externalRef: optionalText(80),
    checkInDate: isoDate,
    checkOutDate: isoDate,
    adults: z.coerce.number().int().min(1).max(20),
    children: z.coerce.number().int().min(0).max(20),
    pricePerNightMad: madAmount,
    otaCommissionMad: madAmount,
    roomId: optionalText(36),
    notes: optionalText(2000),
  })
  .refine((v) => v.checkOutDate > v.checkInDate, {
    path: ['checkOutDate'],
    message: 'checkout_before_checkin',
  });
export type StayFormInput = z.infer<typeof stayFormSchema>;

export type GuestDto = {
  id: string;
  isMain: boolean;
  firstName: string;
  lastName: string;
  sex: Sex | null;
  nationality: string | null;
  birthDate: IsoDate | null;
  documentType: DocumentType | null;
  /** Decrypted; only present on stay detail. */
  documentNumber: string | null;
  documentExpiry: IsoDate | null;
  phone: string | null;
  email: string | null;
  hasPassportPhoto: boolean;
  consentAt: string | null;
};

export type StaySummaryDto = {
  id: string;
  status: StayStatus;
  source: StaySource;
  externalRef: string | null;
  checkInDate: IsoDate;
  checkOutDate: IsoDate;
  nights: number;
  adults: number;
  children: number;
  pricePerNight: number;
  totalAccommodation: number;
  room: { id: string; name: string } | null;
  requestedRoom: { id: string; name: string } | null;
  mainGuest: { firstName: string; lastName: string; nationality: string | null } | null;
  guestCount: number;
  createdAt: string;
};

export type StayDetailDto = StaySummaryDto & {
  otaCommission: number;
  notes: string | null;
  confirmedAt: string | null;
  confirmedBy: { id: string; name: string } | null;
  checkedOutAt: string | null;
  guests: GuestDto[];
  extras: StayExtraDto[];
  payments: PaymentDto[];
  invoices: InvoiceSummaryDto[];
};

export type TodayDto = {
  date: IsoDate;
  pending: StaySummaryDto[];
  arrivals: StaySummaryDto[];
  departures: StaySummaryDto[];
  inHouse: StaySummaryDto[];
  rooms: { total: number; occupied: number; free: number; cleaning: number; outOfService: number };
};
