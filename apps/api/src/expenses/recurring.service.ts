import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, type RecurringExpense } from '@prisma/client';
import {
  isoToUtcDate,
  nextRecurringDate,
  recurringDueDate,
  TIMEZONE,
  todayIso,
  utcDateToIso,
  type Paginated,
  type RecurringExpenseDto,
} from '@riad/shared';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { pageArgs, paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { toCategoryDto } from './expense.mapper';
import type { CreateRecurringDto, ListRecurringQueryDto, UpdateRecurringDto } from './expenses.dto';
import { resolveSupplier } from './suppliers';

const include = {
  category: true,
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.RecurringExpenseInclude;
type Row = Prisma.RecurringExpenseGetPayload<{ include: typeof include }>;

/**
 * Rent, internet, salaries of a fixed amount… A daily job creates this month's expense
 * once its day is reached. A unique (recurring_id, date) index makes it idempotent, so
 * re-running or a server restart never duplicates an expense.
 */
@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Cron('0 15 0 * * *', { name: 'recurring-expenses', timeZone: TIMEZONE })
  async nightly(): Promise<void> {
    const created = await this.generateDue();
    if (created) this.logger.log(`Recurring expenses: ${created} created`);
  }

  /** Creates the expenses due today or earlier this month. Returns how many were created. */
  async generateDue(riadId?: string, today: string = todayIso()): Promise<number> {
    const list = await this.prisma.recurringExpense.findMany({ where: { isActive: true, ...(riadId ? { riadId } : {}) } });
    let created = 0;
    for (const r of list) {
      const due = recurringDueDate(today, r.dayOfMonth, todayIso(TIMEZONE, r.createdAt));
      if (!due) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          const e = await tx.expense.create({
            data: {
              riadId: r.riadId,
              categoryId: r.categoryId,
              supplierId: r.supplierId,
              amountTtc: r.amount,
              date: isoToUtcDate(due),
              paymentMethod: r.paymentMethod,
              note: r.label,
              recurringId: r.id,
            },
          });
          await this.audit.log(
            { riadId: r.riadId, userId: null, action: 'expense.recurring_create', entity: 'Expense', entityId: e.id, diff: { recurringId: r.id, date: due } },
            tx,
          );
        });
        created++;
      } catch (e) {
        // Already generated for that date: nothing to do.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    return created;
  }

  async list(p: AuthPrincipal, q: ListRecurringQueryDto): Promise<Paginated<RecurringExpenseDto>> {
    const where = { riadId: p.riadId, ...(q.includeInactive ? {} : { isActive: true }) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.recurringExpense.findMany({ where, include, orderBy: [{ isActive: 'desc' }, { dayOfMonth: 'asc' }], ...pageArgs(q) }),
      this.prisma.recurringExpense.count({ where }),
    ]);
    const last = await this.prisma.expense.groupBy({
      by: ['recurringId'],
      where: { recurringId: { in: rows.map((r) => r.id) } },
      _max: { date: true },
    });
    const lastById = new Map(last.map((l) => [l.recurringId, l._max.date]));
    return paginated(rows.map((r) => this.toDto(r, lastById.get(r.id) ?? null)), total, q);
  }

  async create(p: AuthPrincipal, dto: CreateRecurringDto): Promise<RecurringExpenseDto> {
    await this.assertCategory(p.riadId, dto.categoryId);
    const row = await this.prisma.$transaction(async (tx) => {
      const supplierId = await this.supplierIdFor(tx, p, dto.supplierId, dto.supplierName, dto.categoryId);
      const created = await tx.recurringExpense.create({
        data: {
          riadId: p.riadId,
          label: dto.label,
          categoryId: dto.categoryId,
          amount: dto.amount,
          dayOfMonth: dto.dayOfMonth,
          paymentMethod: dto.paymentMethod ?? 'TRANSFER',
          supplierId,
          createdBy: p.userId,
        },
        include,
      });
      await this.audit.log(
        { riadId: p.riadId, userId: p.userId, action: 'recurring.create', entity: 'RecurringExpense', entityId: created.id, diff: { amount: dto.amount, dayOfMonth: dto.dayOfMonth } },
        tx,
      );
      return created;
    });
    return this.toDto(row, null);
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateRecurringDto): Promise<RecurringExpenseDto> {
    const before = await this.findOrThrow(p.riadId, id);
    if (dto.categoryId) await this.assertCategory(p.riadId, dto.categoryId);
    const row = await this.prisma.$transaction(async (tx) => {
      const supplierId =
        dto.supplierId !== undefined || dto.supplierName !== undefined
          ? await this.supplierIdFor(tx, p, dto.supplierId, dto.supplierName, dto.categoryId ?? before.categoryId)
          : undefined;
      const updated = await tx.recurringExpense.update({
        where: { id },
        data: {
          label: dto.label,
          categoryId: dto.categoryId,
          amount: dto.amount,
          dayOfMonth: dto.dayOfMonth,
          paymentMethod: dto.paymentMethod,
          isActive: dto.isActive,
          supplierId,
        },
        include,
      });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'recurring.update',
          entity: 'RecurringExpense',
          entityId: id,
          diff: { amount: [before.amount, updated.amount], isActive: [before.isActive, updated.isActive] },
        },
        tx,
      );
      return updated;
    });
    return this.toDto(row, null);
  }

  /** Deletes a template never used; otherwise deactivates it so past expenses keep their link. */
  async remove(p: AuthPrincipal, id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
    await this.findOrThrow(p.riadId, id);
    const used = await this.prisma.expense.count({ where: { recurringId: id } });
    if (used) await this.prisma.recurringExpense.update({ where: { id }, data: { isActive: false } });
    else await this.prisma.recurringExpense.delete({ where: { id } });
    await this.audit.log({
      riadId: p.riadId,
      userId: p.userId,
      action: used ? 'recurring.deactivate' : 'recurring.delete',
      entity: 'RecurringExpense',
      entityId: id,
    });
    return { deleted: !used, deactivated: used > 0 };
  }

  private toDto(r: Row, last: Date | null): RecurringExpenseDto {
    return {
      id: r.id,
      label: r.label,
      amount: r.amount,
      dayOfMonth: r.dayOfMonth,
      paymentMethod: r.paymentMethod,
      isActive: r.isActive,
      category: toCategoryDto(r.category),
      supplier: r.supplier,
      nextDate: nextRecurringDate(todayIso(), r.dayOfMonth),
      lastGenerated: last ? utcDateToIso(last) : null,
    };
  }

  private async findOrThrow(riadId: string, id: string): Promise<RecurringExpense> {
    const r = await this.prisma.recurringExpense.findFirst({ where: { id, riadId } });
    if (!r) throw new AppException('NOT_FOUND', 'Recurring expense not found', HttpStatus.NOT_FOUND);
    return r;
  }

  private async assertCategory(riadId: string, id: string): Promise<void> {
    const c = await this.prisma.expenseCategory.findFirst({ where: { id, riadId, isActive: true } });
    if (!c) throw new AppException('NOT_FOUND', 'Category not found', HttpStatus.NOT_FOUND);
  }

  private async supplierIdFor(
    tx: Prisma.TransactionClient,
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
}
