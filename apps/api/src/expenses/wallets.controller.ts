import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CashWallet, Prisma } from '@prisma/client';
import {
  PERMISSIONS as P,
  type CashMovementDto,
  type CashWalletDto,
  type Paginated,
} from '@riad/shared';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { PaginationQueryDto, pageArgs, paginated } from '../common/pagination';
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

  @RequireAnyPermission(P.EXPENSES_WRITE, P.EXPENSES_WRITE_PETTY_CASH)
  @Get(':id/movements')
  async movements(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PaginationQueryDto,
  ): Promise<Paginated<CashMovementDto>> {
    await this.findOrThrow(p, id);
    const where = { walletId: id, riadId: p.riadId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cashMovement.findMany({
        where,
        include: { expense: { include: { category: true, supplier: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(q),
      }),
      this.prisma.cashMovement.count({ where }),
    ]);
    const users = await loadUserNames(this.prisma, p.riadId, rows.map((r) => r.createdBy));
    return paginated(
      rows.map((m) => ({
        id: m.id,
        type: m.type,
        amount: m.amount,
        note: m.note,
        createdAt: m.createdAt.toISOString(),
        createdBy: (m.createdBy && users.get(m.createdBy)) || null,
        expense: m.expense
          ? { id: m.expense.id, category: m.expense.category.nameFr, supplier: m.expense.supplier?.name ?? null }
          : null,
      })),
      total,
      q,
    );
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
