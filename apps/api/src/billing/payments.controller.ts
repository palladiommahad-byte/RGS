import { Controller, Get, Query } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import {
  addDays,
  PAYMENT_METHODS,
  PERMISSIONS as P,
  zonedMidnight,
  type PaymentMethod,
  type PaymentsReportDto,
} from '@riad/shared';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, RequireAnyPermission } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { pageArgs, PaginationQueryDto } from '../common/pagination';
import { IsIsoDate } from '../common/validation';
import { loadUserNames } from '../expenses/expense.mapper';
import { PrismaService } from '../prisma/prisma.service';

export class ListPaymentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'First day, YYYY-MM-DD (riad time)' }) @IsOptional() @IsIsoDate() from?: string;
  @ApiPropertyOptional({ description: 'Last day, YYYY-MM-DD (riad time)' }) @IsOptional() @IsIsoDate() to?: string;
  @ApiPropertyOptional({ enum: PAYMENT_METHODS }) @IsOptional() @IsIn(PAYMENT_METHODS) method?: PaymentMethod;
  @ApiPropertyOptional({ description: 'Staff member who received the payment' }) @IsOptional() @IsUUID() receivedBy?: string;
}

/**
 * Every guest payment of the riad, newest first, with totals per method: what should be in
 * the cash drawer, on the card terminal and on the bank account for the period.
 */
@ApiTags('billing')
@RequireAnyPermission(P.FINANCE_REPORTS, P.PAYMENTS_WRITE)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() p: AuthPrincipal, @Query() q: ListPaymentsQueryDto): Promise<PaymentsReportDto> {
    const paidAt: Prisma.DateTimeFilter = {};
    if (q.from) paidAt.gte = zonedMidnight(q.from);
    if (q.to) paidAt.lt = zonedMidnight(addDays(q.to, 1));
    const period: Prisma.PaymentWhereInput = { riadId: p.riadId, ...(q.from || q.to ? { paidAt } : {}) };
    // Totals follow the person filter but not the method one, so each method's sum stays visible.
    const forTotals: Prisma.PaymentWhereInput = { ...period, ...(q.receivedBy ? { receivedBy: q.receivedBy } : {}) };
    const where: Prisma.PaymentWhereInput = { ...forTotals, ...(q.method ? { method: q.method } : {}) };

    const [rows, total, sums, receivers] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: {
          stay: {
            select: {
              id: true,
              room: { select: { name: true } },
              requestedRoom: { select: { name: true } },
              guests: { where: { isMain: true }, select: { firstName: true, lastName: true }, take: 1 },
            },
          },
        },
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(q),
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.groupBy({ by: ['method'], where: forTotals, _sum: { amount: true }, _count: { _all: true }, orderBy: { method: 'asc' } }),
      this.prisma.payment.findMany({ where: { ...period, receivedBy: { not: null } }, distinct: ['receivedBy'], select: { receivedBy: true } }),
    ]);

    const names = await loadUserNames(this.prisma, p.riadId, [...rows.map((r) => r.receivedBy), ...receivers.map((r) => r.receivedBy)]);
    const totals = { CASH: 0, CARD: 0, TRANSFER: 0, OTA_COLLECTED: 0, all: 0, count: 0 };
    for (const s of sums) {
      const amount = s._sum?.amount ?? 0;
      totals[s.method] = amount;
      totals.all += amount;
      totals.count += typeof s._count === 'object' ? (s._count._all ?? 0) : 0;
    }

    return {
      items: rows.map((r) => {
        const guest = r.stay.guests[0];
        return {
          id: r.id,
          amount: r.amount,
          method: r.method,
          paidAt: r.paidAt.toISOString(),
          note: r.note,
          receivedBy: (r.receivedBy && names.get(r.receivedBy)) || null,
          stay: {
            id: r.stay.id,
            guestName: guest ? `${guest.firstName} ${guest.lastName}` : null,
            roomName: (r.stay.room ?? r.stay.requestedRoom)?.name ?? null,
          },
        };
      }),
      total,
      page: q.page,
      limit: q.limit,
      totals,
      receivers: receivers
        .map((r) => (r.receivedBy && names.get(r.receivedBy)) || null)
        .filter((u): u is { id: string; name: string } => !!u)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
