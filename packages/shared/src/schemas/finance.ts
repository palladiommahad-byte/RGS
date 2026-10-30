import { z } from 'zod';
import {
  TAX_CODES,
  TAX_MODES,
  type ExtraCategory,
  type StaySource,
  type TaxCode,
  type TaxMode,
} from '../constants';
import { isIsoDate, type IsoDate } from '../dates';

export type PeriodMetricsDto = {
  from: IsoDate;
  to: IsoDate;
  /** HT, centimes. */
  revenue: number;
  accommodationRevenue: number;
  extrasRevenue: number;
  expenses: number;
  profit: number;
  margin: number | null;
  occupancy: number | null;
  adr: number | null;
  revpar: number | null;
  costPerOccupiedNight: number | null;
  occupiedNights: number;
  availableNights: number;
};

export type FinanceDashboardDto = {
  current: PeriodMetricsDto;
  previous: PeriodMetricsDto;
  /** 6 months ending with the period's month. */
  months: (PeriodMetricsDto & { month: string })[];
  bySource: { source: StaySource; revenue: number; commission: number; net: number }[];
  expensesByCategory: { categoryId: string; key: string | null; nameFr: string; nameAr: string; amount: number }[];
  extrasByCategory: { category: ExtraCategory; amount: number }[];
  alerts: { categoryId: string; key: string | null; nameFr: string; nameAr: string; month: string; amount: number; average: number }[];
};

export type TaxSettingDto = {
  id: string;
  code: TaxCode;
  mode: TaxMode;
  value: number;
  validFrom: IsoDate;
  validTo: IsoDate | null;
};

/** Staff types a percentage (10) or an amount in MAD (25,50); stored as bp / centimes. */
export const taxSettingFormSchema = z.object({
  code: z.enum(TAX_CODES),
  mode: z.enum(TAX_MODES),
  value: z
    .string()
    .trim()
    .regex(/^\d+([.,]\d{1,2})?$/, 'invalid_amount'),
  validFrom: z.string().refine(isIsoDate, 'invalid_date'),
  validTo: z
    .string()
    .refine((v) => v === '' || isIsoDate(v), 'invalid_date')
    .optional(),
});

export type TaxReportDto = {
  month: string;
  invoiceCount: number;
  totalHt: number;
  tvaCollected: number;
  tvaByRate: { rate: number; base: number; tva: number }[];
  tvaDeductible: number;
  /** Collected − deductible; negative = TVA credit. */
  tvaDue: number;
  taxeSejour: number;
  tpt: number;
  totalTtc: number;
  expenseCount: number;
};

