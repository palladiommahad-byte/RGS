import type { BillComputation, IsoDate } from '@riad/shared';

/**
 * Frozen at checkout and stored in invoices.breakdown: the PDF and the bill view are
 * rebuilt from it, so a reprint never changes even if prices, rates or names change.
 */
export type InvoiceBreakdown = BillComputation & {
  ratesDate: IsoDate;
  paidAtIssue: number;
  stay: {
    roomName: string | null;
    checkInDate: IsoDate;
    checkOutDate: IsoDate;
    nights: number;
    adults: number;
    children: number;
  };
  guest: { name: string; nationality: string | null } | null;
};
