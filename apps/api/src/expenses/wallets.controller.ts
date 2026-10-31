import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Prisma, type CashWallet } from '@prisma/client';
import {
  addDays,
  CASH_MOVEMENT_TYPES,
  PERMISSIONS as P,
  zonedMidnight,
  type CashBoxReportDto,
  type CashMovementType,
  type CashWalletDto,
} from '@riad/shared';
import { IsIn, IsOptional } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { PaginationQueryDto, pageArgs } from '../common/pagination';
import { IsIsoDate } from '../common/validation';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { loadUserNames } from './expense.mapper';
import { AdjustWalletDto, CreateWalletDto, TopUpDto, UpdateWalletDto } from './expenses.dto';

const walletInclude = { holder: { select: { id: true, name: true } } } satisfies Prisma.CashWalletInclude;
type WalletRow = Prisma.CashWalletGetPayload<{ include: typeof walletInclude }>;
const toView = (w: WalletRow): CashWalletDto => ({
  id: w.id,
  name: w.name,
  balance: w.balance,
  isActive: w.isActive,
  holder: w.holder,
});

const manages = (p: AuthPrincipal) => p.permissions.includes(P.EXPENSES_WRITE);

export class ListMovementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'First day, YYYY-MM-DD (riad time)' }) @IsOptional() @IsIsoDate() from?: string;
  @ApiPropertyOptional({ description: 'Last day, YYYY-MM-DD (riad time)' }) @IsOptional() @IsIsoDate() to?: string;
  @ApiPropertyOptional({ enum: CASH_MOVEMENT_TYPES }) @IsOptional() @IsIn(CASH_MOVEMENT_TYPES) type?: CashMovementType;
}

/**
 * Petty cash: a manager gives cash to a staff member (top-up); their expenses debit the
 * wallet. The balance is kept in step with the movements inside each transaction.
 */
@ApiTags('expenses')
@Controller('cash-wallets')
export class WalletsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  @RequireAnyPermission(P.EXPENSES_WRITE, P.EXPENSES_WRITE_PETTY_CASH)
  @Get()
  async list(@CurrentUser() p: AuthPrincipal): Promise<CashWalletDto[]> {
    const rows = await this.prisma.cashWallet.findMany({
      where: { riadId: p.riadId, ...(manages(p) ? {} : { holderId: p.userId, isActive: true }) },
      include: walletInclude,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toView);
  }

  /** Staff who can hold a wallet. */
  @RequirePermissions(P.EXPENSES_WRITE)
  @Get('holders')
  holders(@CurrentUser() p: AuthPrincipal) {
    return this.prisma.user.findMany({
      where: { riadId: p.riadId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  @RequirePermissions(P.EXPENSES_WRITE)
  @Post()
  async create(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateWalletDto): Promise<CashWalletDto> {
    const holder = await this.prisma.user.findFirst({ where: { id: dto.holderId, riadId: p.riadId, isActive: true } });
    if (!holder) throw new AppException('NOT_FOUND', 'User not found', HttpStatus.NOT_FOUND);
    const row = await this.prisma.cashWallet.create({
      data: { riadId: p.riadId, holderId: dto.holderId, name: dto.name, createdBy: p.userId },
      include: walletInclude,
    });
    await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'wallet.create', entity: 'CashWallet', entityId: row.id });
    return toView(row);
  }

  @RequirePermissions(P.EXPENSES_WRITE)
  @Patch(':id')
  async update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWalletDto,
  ): Promise<CashWalletDto> {
    await this.findOrThrow(p, id);
    const row = await this.prisma.cashWallet.update({ where: { id }, data: dto, include: walletInclude });
    await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'wallet.update', entity: 'CashWallet', entityId: id, diff: { ...dto } });
    return toView(row);
  }

  @RequirePermissions(P.EXPENSES_WRITE)
  @Post(':id/top-up')
  topUp(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TopUpDto): Promise<CashWalletDto> {
    return this.move(p, id, 'TOP_UP', dto.amount, dto.note);
  }

  /** Cash count correction (signed). Can never leave a negative balance. */
  @RequirePermissions(P.EXPENSES_WRITE)
  @Post(':id/adjust')
  adjust(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustWalletDto,
  ): Promise<CashWalletDto> {
    return this.move(p, id, 'ADJUSTMENT', dto.amount, dto.note);
  }

  /**
   * Every movement of the box, newest first: guest cash, top-ups, expenses, corrections.
   * Each one carries the balance right after it; totals cover the whole period.
   */
  @RequireAnyPermission(P.EXPENSES_WRITE, P.EXPENSES_WRITE_PETTY_CASH)
  @Get(':id/movements')
  async movements(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ListMovementsQueryDto,
  ): Promise<CashBoxReportDto> {
    await this.findOrThrow(p, id);
    const createdAt: Prisma.DateTimeFilter = {};
    if (q.from) createdAt.gte = zonedMidnight(q.from);
    if (q.to) createdAt.lt = zonedMidnight(addDays(q.to, 1));
    const period: Prisma.CashMovementWhereInput = { walletId: id, riadId: p.riadId, ...(q.from || q.to ? { createdAt } : {}) };
    const where: Prisma.CashMovementWhereInput = { ...period, ...(q.type ? { type: q.type } : {}) };

    const [rows, total, sums] = await this.prisma.$transaction([
      this.prisma.cashMovement.findMany({
        where,
        include: {
          expense: { include: { category: true, supplier: { select: { name: true } } } },
          payment: {
            select: {
              id: true,
              stay: {
                select: {
                  id: true,
                  room: { select: { name: true } },
                  requestedRoom: { select: { name: true } },
                  guests: { where: { isMain: true }, take: 1, select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(q),
      }),
      this.prisma.cashMovement.count({ where }),
      this.prisma.cashMovement.groupBy({ by: ['type'], where: period, _sum: { amount: true }, orderBy: { type: 'asc' } }),
    ]);

    // The balance is the sum of the box's movements: running total, oldest first.
    const running = rows.length
      ? await this.prisma.$queryRaw<{ id: string; after: bigint }[]>`
          SELECT id, after FROM (
            SELECT id, SUM(amount) OVER (ORDER BY created_at, id) AS after
            FROM cash_movements WHERE wallet_id = ${id}::uuid
          ) t WHERE id IN (${Prisma.join(rows.map((r) => Prisma.sql`${r.id}::uuid`))})`
      : [];
    const after = new Map(running.map((r) => [r.id, Number(r.after)]));

    const byType = { TOP_UP: 0, PAYMENT: 0, EXPENSE: 0, ADJUSTMENT: 0 };
    for (const s of sums) byType[s.type] = s._sum?.amount ?? 0;
    // Money in = every positive movement (a correction can go either way); out = the rest.
    const positive = await this.prisma.cashMovement.aggregate({ where: { ...period, amount: { gt: 0 } }, _sum: { amount: true } });
    const moneyIn = positive._sum.amount ?? 0;
    const moneyOut = moneyIn - Object.values(byType).reduce((n, v) => n + v, 0);

    const users = await loadUserNames(this.prisma, p.riadId, rows.map((r) => r.createdBy));
    return {
      items: rows.map((m) => {
        const stay = m.payment?.stay;
        const guest = stay?.guests[0];
        return {
          id: m.id,
          type: m.type,
          amount: m.amount,
          note: m.note,
          createdAt: m.createdAt.toISOString(),
          createdBy: (m.createdBy && users.get(m.createdBy)) || null,
          expense: m.expense
            ? { id: m.expense.id, category: m.expense.category.nameFr, categoryKey: m.expense.category.key, supplier: m.expense.supplier?.name ?? null }
            : null,
          payment:
            m.payment && stay
              ? {
                  id: m.payment.id,
                  stayId: stay.id,
                  guestName: guest ? `${guest.firstName} ${guest.lastName}` : null,
                  roomName: (stay.room ?? stay.requestedRoom)?.name ?? null,
                }
              : null,
          balanceAfter: after.get(m.id) ?? 0,
        };
      }),
      total,
      page: q.page,
      limit: q.limit,
      totals: { in: moneyIn, out: moneyOut, byType },
    };
  }

  private async move(
    p: AuthPrincipal,
    id: string,
    type: 'TOP_UP' | 'ADJUSTMENT',
    amount: number,
    note: string | undefined,
  ): Promise<CashWalletDto> {
    await this.findOrThrow(p, id);
    const row = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.cashWallet.updateMany({
        where: { id, riadId: p.riadId, isActive: true, ...(amount < 0 ? { balance: { gte: -amount } } : {}) },
        data: { balance: { increment: amount } },
      });
      if (count !== 1) {
        throw new AppException('INSUFFICIENT_FUNDS', 'The balance cannot go below zero', HttpStatus.CONFLICT);
      }
      await tx.cashMovement.create({ data: { riadId: p.riadId, walletId: id, type, amount, note, createdBy: p.userId } });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: type === 'TOP_UP' ? 'wallet.top_up' : 'wallet.adjust',
          entity: 'CashWallet',
          entityId: id,
          diff: { amount, note: note ?? null },
        },
        tx,
      );
      return tx.cashWallet.findUniqueOrThrow({ where: { id }, include: walletInclude });
    });
    await this.notifications.cash(p.riadId, id, p.userId, type, amount, note);
    return toView(row);
  }

  private async findOrThrow(p: AuthPrincipal, id: string): Promise<CashWallet> {
    const w = await this.prisma.cashWallet.findFirst({
      where: { id, riadId: p.riadId, ...(manages(p) ? {} : { holderId: p.userId }) },
    });
    if (!w) throw new AppException('NOT_FOUND', 'Wallet not found', HttpStatus.NOT_FOUND);
    return w;
  }
}
