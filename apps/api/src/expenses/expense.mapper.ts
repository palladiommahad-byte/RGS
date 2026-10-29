import type { ExpenseCategory, Prisma } from '@prisma/client';
import { utcDateToIso, type ExpenseCategoryDto, type ExpenseDto } from '@riad/shared';

export const expenseInclude = {
  category: true,
  supplier: { select: { id: true, name: true } },
  wallet: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;
export type UserNames = Map<string, { id: string; name: string }>;

export function toCategoryDto(c: ExpenseCategory): ExpenseCategoryDto {
  return { id: c.id, key: c.key, nameFr: c.nameFr, nameAr: c.nameAr, icon: c.icon };
}

export function toExpenseDto(e: ExpenseRow, users: UserNames): ExpenseDto {
  return {
    id: e.id,
    amountTtc: e.amountTtc,
    tvaAmount: e.tvaAmount,
    date: utcDateToIso(e.date),
    paymentMethod: e.paymentMethod,
    note: e.note,
    category: toCategoryDto(e.category),
    supplier: e.supplier,
    wallet: e.wallet,
    createdBy: (e.createdBy && users.get(e.createdBy)) || null,
    hasReceipt: Boolean(e.receiptKey),
    source: e.payrollEntryId ? 'PAYROLL' : e.recurringId ? 'RECURRING' : 'MANUAL',
    createdAt: e.createdAt.toISOString(),
  };
}

/** Looks up display names for created_by / received_by columns (no FK on purpose). */
export async function loadUserNames(
  prisma: { user: { findMany: (args: Prisma.UserFindManyArgs) => Promise<{ id: string; name: string }[]> } },
  riadId: string,
  ids: (string | null | undefined)[],
): Promise<UserNames> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique }, riadId }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u]));
}
