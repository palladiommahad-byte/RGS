import { z } from 'zod';
import type { BillComputation, BillLine, BillTotals } from '../billing';
import {
  EXTRA_CATEGORIES,
  PAYMENT_METHODS,
  type DocumentType,
  type ExtraCategory,
  type PaymentMethod,
  type Sex,
  type StayStatus,
  type TaxCode,
} from '../constants';
import type { IsoDate } from '../dates';

const madAmount = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d{1,2})?$/, 'invalid_amount');

export const extraFormSchema = z.object({
  label: z.string().trim().min(1).max(120),
  category: z.enum(EXTRA_CATEGORIES),
  quantity: z.coerce.number().int().min(1).max(999),
  unitPriceMad: madAmount,
});
export type ExtraFormInput = z.infer<typeof extraFormSchema>;

export const paymentFormSchema = z.object({
  amountMad: madAmount.refine((v) => Number(v.replace(',', '.')) > 0, 'invalid_amount'),
  method: z.enum(PAYMENT_METHODS),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type PaymentFormInput = z.infer<typeof paymentFormSchema>;

export type StayExtraDto = {
  id: string;
  label: string;
  category: ExtraCategory;
  quantity: number;
  unitPrice: number;
  total: number;
  createdAt: string;
};

export type PaymentDto = {
  id: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  note: string | null;
  receivedBy: { id: string; name: string } | null;
};

export type InvoiceSummaryDto = { id: string; number: string; totalTtc: number; issuedAt: string };

export type BillDto = {
  lines: BillLine[];
  totals: BillTotals;
  tvaByRate: BillComputation['tvaByRate'];
  missingRates: TaxCode[];
  paid: number;
  balance: number;
  /** Date whose tax rates were applied (invoice date once issued). */
  ratesDate: IsoDate;
  /** Set once the stay is checked out: the bill is then the frozen invoice. */
  invoice: InvoiceSummaryDto | null;
};

export type CheckoutResultDto = { invoice: InvoiceSummaryDto; balance: number };

/** One line of the guest register (police fiche). */
export type GuestRegisterRowDto = {
  guestId: string;
  stayId: string;
  isMain: boolean;
  firstName: string;
  lastName: string;
  sex: Sex | null;
  nationality: string | null;
  birthDate: IsoDate | null;
  documentType: DocumentType | null;
  documentNumber: string | null;
  checkInDate: IsoDate;
  checkOutDate: IsoDate;
  room: string | null;
  status: StayStatus;
};

export const REGISTER_EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type RegisterExportFormat = (typeof REGISTER_EXPORT_FORMATS)[number];
/** Longest period one export may cover. */
export const REGISTER_EXPORT_MAX_DAYS = 366;
