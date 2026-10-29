import { HttpStatus, Injectable } from '@nestjs/common';
import type { Expense, Prisma } from '@prisma/client';
import {
  isoToUtcDate,
  PERMISSIONS,
  todayIso,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type ExpenseListDto,
} from '@riad/shared';
import sharp from 'sharp';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { pageArgs } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { expenseInclude, loadUserNames, toCategoryDto, toExpenseDto } from './expense.mapper';
import type { CreateExpenseDto, ListExpensesQueryDto, UpdateExpenseDto } from './expenses.dto';
import { resolveSupplier } from './suppliers';

type Tx = Prisma.TransactionClient;

const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const canWriteAll = (p: AuthPrincipal) => p.permissions.includes(PERMISSIONS.EXPENSES_WRITE);
const canReadAll = (p: AuthPrincipal) => p.permissions.includes(PERMISSIONS.EXPENSES_READ_ALL);

/**
 * Expenses. Managers (expenses.write) record anything; reception (petty cash only) records
 * expenses paid from their own wallet and sees only what they entered.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async categories(p: AuthPrincipal): Promise<ExpenseCategoryDto[]> {
    const rows = await this.prisma.expenseCategory.findMany({
      where: { riadId: p.riadId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameFr: 'asc' }],
    });
    return rows.map(toCategoryDto);
  }

  async list(p: AuthPrincipal, q: ListExpensesQueryDto): Promise<ExpenseListDto> {
    const where: Prisma.ExpenseWhereInput = { riadId: p.riadId };
    // Without expenses.read_all a user only sees what they entered themselves.
    if (!canReadAll(p)) where.createdBy = p.userId;
    else if (q.createdBy) where.createdBy = q.createdBy;
    if (q.from || q.to) {
      where.date = {
        ...(q.from ? { gte: isoToUtcDate(q.from) } : {}),
        ...(q.to ? { lte: isoToUtcDate(q.to) } : {}),
      };
    }
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.supplierId) where.supplierId = q.supplierId;
    if (q.walletId) where.walletId = q.walletId;

    const [rows, total, sum] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        ...pageArgs(q),
      }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amountTtc: true } }),
    ]);
    const users = await loadUserNames(this.prisma, p.riadId, rows.map((r) => r.createdBy));
    return {
      items: rows.map((r) => toExpenseDto(r, users)),
      total,
      page: q.page,
      limit: q.limit,
      sumTtc: sum._sum.amountTtc ?? 0,
    };
  }

  async create(p: AuthPrincipal, dto: CreateExpenseDto): Promise<ExpenseDto> {
    await this.assertCategory(p.riadId, dto.categoryId);
    assertTva(dto.amountTtc, dto.tvaAmount);
    const full = canWriteAll(p);
    let method = dto.paymentMethod ?? (full ? 'CASH' : 'PETTY_CASH');
    let walletId = dto.walletId;

    if (!full) {
      // Petty-cash users can only spend from their own wallet.
      method = 'PETTY_CASH';
      const own = await this.prisma.cashWallet.findFirst({
        where: { riadId: p.riadId, holderId: p.userId, isActive: true, ...(walletId ? { id: walletId } : {}) },
        orderBy: { createdAt: 'asc' },
      });
      if (!own) throw new AppException('NO_WALLET', 'You have no petty-cash wallet', HttpStatus.FORBIDDEN);
      walletId = own.id;
    }
    if (method === 'PETTY_CASH' && !walletId) {
      throw new AppException('WALLET_REQUIRED', 'Choose the petty-cash wallet', HttpStatus.BAD_REQUEST);
    }
    if (method !== 'PETTY_CASH') walletId = undefined;

    const expense = await this.prisma.$transaction(async (tx) => {
      const supplierId = await this.supplierIdFor(tx, p, dto.supplierId, dto.supplierName, dto.categoryId);
      const created = await tx.expense.create({
        data: {
          riadId: p.riadId,
          categoryId: dto.categoryId,
          supplierId,
          amountTtc: dto.amountTtc,
          tvaAmount: dto.tvaAmount ?? 0,
          date: isoToUtcDate(dto.date ?? todayIso()),
          paymentMethod: method,
          walletId,
          note: dto.note,
          createdBy: p.userId,
        },
        include: expenseInclude,
      });
      if (walletId) await this.debitWallet(tx, p, walletId, created.id, dto.amountTtc);
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'expense.create',
          entity: 'Expense',
          entityId: created.id,
          diff: { amountTtc: dto.amountTtc, categoryId: dto.categoryId, method, walletId: walletId ?? null },
        },
        tx,
      );
      return created;
    });
    const users = await loadUserNames(this.prisma, p.riadId, [expense.createdBy]);
    return toExpenseDto(expense, users);
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateExpenseDto): Promise<ExpenseDto> {
    const before = await this.findOrThrow(p, id);
    assertEditable(before);
    if (dto.paymentMethod && (dto.paymentMethod === 'PETTY_CASH') !== Boolean(before.walletId)) {
      throw new AppException(
        'METHOD_LOCKED',
        'Delete and re-enter the expense to move it in or out of a petty-cash wallet',
        HttpStatus.CONFLICT,
      );
    }
    if (dto.categoryId) await this.assertCategory(p.riadId, dto.categoryId);
    const amount = dto.amountTtc ?? before.amountTtc;
    assertTva(amount, dto.tvaAmount ?? before.tvaAmount);

    const updated = await this.prisma.$transaction(async (tx) => {
      const supplierId =
        dto.supplierId !== undefined || dto.supplierName !== undefined
          ? await this.supplierIdFor(tx, p, dto.supplierId, dto.supplierName, dto.categoryId ?? before.categoryId)
          : undefined;
      if (before.walletId && amount !== before.amountTtc) {
        // Re-debit the wallet by the difference and keep the movement in sync.
        const delta = amount - before.amountTtc;
        if (delta > 0) await this.takeFromWallet(tx, p.riadId, before.walletId, delta);
        else await tx.cashWallet.update({ where: { id: before.walletId }, data: { balance: { increment: -delta } } });
        await tx.cashMovement.updateMany({ where: { expenseId: id }, data: { amount: -amount } });
      }
      const row = await tx.expense.update({
        where: { id },
        data: {
          amountTtc: dto.amountTtc,
          tvaAmount: dto.tvaAmount,
          categoryId: dto.categoryId,
          supplierId,
          date: dto.date ? isoToUtcDate(dto.date) : undefined,
          paymentMethod: dto.paymentMethod,
          note: dto.note,
        },
        include: expenseInclude,
      });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'expense.update',
          entity: 'Expense',
          entityId: id,
          diff: { amountTtc: [before.amountTtc, row.amountTtc], categoryId: [before.categoryId, row.categoryId] },
        },
        tx,
      );
      return row;
    });
    const users = await loadUserNames(this.prisma, p.riadId, [updated.createdBy]);
    return toExpenseDto(updated, users);
  }

  async remove(p: AuthPrincipal, id: string): Promise<void> {
    const expense = await this.findOrThrow(p, id);
    assertEditable(expense);
    await this.prisma.$transaction(async (tx) => {
      if (expense.walletId) {
        await tx.cashMovement.deleteMany({ where: { expenseId: id } });
        await tx.cashWallet.update({ where: { id: expense.walletId }, data: { balance: { increment: expense.amountTtc } } });
      }
      await tx.expense.delete({ where: { id } });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'expense.delete',
          entity: 'Expense',
          entityId: id,
          diff: { amountTtc: expense.amountTtc, categoryId: expense.categoryId, walletId: expense.walletId },
        },
        tx,
      );
    });
    await this.storage.delete('receipts', [expense.receiptKey]);
  }

  async attachReceipt(p: AuthPrincipal, id: string, file: Express.Multer.File | undefined): Promise<ExpenseDto> {
    const expense = await this.findOrThrow(p, id);
    if (!canWriteAll(p) && expense.createdBy !== p.userId) {
      throw new AppException('FORBIDDEN', 'Not your expense', HttpStatus.FORBIDDEN);
    }
    if (!file || !RECEIPT_TYPES.includes(file.mimetype)) {
      throw new AppException('UNSUPPORTED_FILE', 'Send a photo (JPEG, PNG, WebP) or a PDF');
    }
    let body = file.buffer;
    let ext = 'pdf';
    let contentType = 'application/pdf';
    if (file.mimetype !== 'application/pdf') {
      try {
        body = await sharp(file.buffer)
          .rotate()
          .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch {
        throw new AppException('UNSUPPORTED_FILE', 'This image could not be read');
      }
      ext = 'jpg';
      contentType = 'image/jpeg';
    }
    const key = `riads/${p.riadId}/receipts/${expense.date.getUTCFullYear()}/${id}.${ext}`;
    await this.storage.put('receipts', key, body, contentType);
    if (expense.receiptKey && expense.receiptKey !== key) await this.storage.delete('receipts', [expense.receiptKey]);
    const row = await this.prisma.expense.update({ where: { id }, data: { receiptKey: key }, include: expenseInclude });
    const users = await loadUserNames(this.prisma, p.riadId, [row.createdBy]);
    return toExpenseDto(row, users);
  }

  async receiptUrl(p: AuthPrincipal, id: string): Promise<{ url: string }> {
    const expense = await this.findOrThrow(p, id);
    if (!expense.receiptKey) throw new AppException('NOT_FOUND', 'No receipt', HttpStatus.NOT_FOUND);
    return { url: await this.storage.signedUrl('receipts', expense.receiptKey) };
  }

  /** Users who entered expenses (filter list for managers). */
  async creators(p: AuthPrincipal): Promise<{ id: string; name: string }[]> {
    return this.prisma.user.findMany({
      where: { riadId: p.riadId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  // ---------------------------------------------------------------------------

  private async findOrThrow(p: AuthPrincipal, id: string): Promise<Expense> {
    const expense = await this.prisma.expense.findFirst({
      where: { id, riadId: p.riadId, ...(canReadAll(p) ? {} : { createdBy: p.userId }) },
    });
    if (!expense) throw new AppException('NOT_FOUND', 'Expense not found', HttpStatus.NOT_FOUND);
    return expense;
  }

  private async assertCategory(riadId: string, categoryId: string): Promise<void> {
    const c = await this.prisma.expenseCategory.findFirst({ where: { id: categoryId, riadId, isActive: true } });
    if (!c) throw new AppException('NOT_FOUND', 'Category not found', HttpStatus.NOT_FOUND);
  }

  private async supplierIdFor(
    tx: Tx,
    p: AuthPrincipal,
    supplierId: string | undefined,
    supplierName: string | undefined,
    categoryId: string,
  ): Promise<string | null> {
    if (supplierId) {
      const s = await tx.supplier.findFirst({ where: { id: supplierId, riadId: p.riadId } });
      if (!s) throw new AppException('NOT_FOUND', 'Supplier not found', HttpStatus.NOT_FOUND);
      return s.id;
    }
    return supplierName ? resolveSupplier(tx, p.riadId, supplierName, categoryId, p.userId) : null;
  }

  /** Atomically takes money out of a wallet; refuses to go below zero. */
  private async takeFromWallet(tx: Tx, riadId: string, walletId: string, amount: number): Promise<void> {
    const { count } = await tx.cashWallet.updateMany({
      where: { id: walletId, riadId, isActive: true, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (count !== 1) {
      const wallet = await tx.cashWallet.findFirst({ where: { id: walletId, riadId } });
      if (!wallet || !wallet.isActive) throw new AppException('NOT_FOUND', 'Wallet not found', HttpStatus.NOT_FOUND);
      throw new AppException('INSUFFICIENT_FUNDS', 'Not enough cash in the wallet', HttpStatus.CONFLICT, {
        balance: wallet.balance,
      });
    }
  }

  private async debitWallet(tx: Tx, p: AuthPrincipal, walletId: string, expenseId: string, amount: number): Promise<void> {
    await this.takeFromWallet(tx, p.riadId, walletId, amount);
    await tx.cashMovement.create({
      data: { riadId: p.riadId, walletId, type: 'EXPENSE', amount: -amount, expenseId, createdBy: p.userId },
    });
  }
}

function assertTva(amountTtc: number, tva: number | undefined): void {
  if (tva !== undefined && tva > amountTtc) {
    throw new AppException('INVALID_AMOUNT', 'TVA cannot exceed the amount');
  }
}

/** Payroll-generated expenses are owned by the payroll entry (phase 7). */
function assertEditable(e: Expense): void {
  if (e.payrollEntryId) {
    throw new AppException('EXPENSE_LOCKED', 'This expense comes from payroll', HttpStatus.CONFLICT);
  }
}
