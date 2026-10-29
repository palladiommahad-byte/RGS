import type { PayrollEntry, Prisma } from '@prisma/client';
import { isoToUtcDate, utcDateToIso, type ExpensePaymentMethod, type IsoDate } from '@riad/shared';

/**
 * The "Salaries" expense created when a payroll line is marked paid: the net amount, no
 * deductible TVA, linked to the entry (which locks it in the expenses screens).
 * The note carries the month only — never the employee's name — so users who can see
 * expenses but not HR cannot tie an amount to a person. Nothing is created for a zero net.
 */
export function payrollExpenseData(
  entry: Pick<PayrollEntry, 'id' | 'riadId' | 'month' | 'netPaid'>,
  categoryId: string,
  date: IsoDate,
  paymentMethod: ExpensePaymentMethod,
  userId: string,
): Prisma.ExpenseUncheckedCreateInput | null {
  if (entry.netPaid <= 0) return null;
  return {
    riadId: entry.riadId,
    categoryId,
    amountTtc: entry.netPaid,
    tvaAmount: 0,
    date: isoToUtcDate(date),
    paymentMethod,
    note: `Salaire ${utcDateToIso(entry.month).slice(0, 7)}`,
    payrollEntryId: entry.id,
    createdBy: userId,
  };
}
