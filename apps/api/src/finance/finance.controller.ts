import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS as P, type FinanceDashboardDto } from '@riad/shared';
import { IsIn } from 'class-validator';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { IsIsoDate } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from './finance.service';
import { buildPnl, pnlToPdf, pnlToXlsx } from './pnl';

class PeriodQuery {
  @ApiProperty({ example: '2026-10-01' }) @IsIsoDate() from: string;
  @ApiProperty({ example: '2026-10-31', description: 'Inclusive' }) @IsIsoDate() to: string;
}

class PnlExportQuery {
  @ApiProperty({ description: 'Last day of the 12-month window' }) @IsIsoDate() to: string;
  @ApiProperty({ enum: ['xlsx', 'pdf'] }) @IsIn(['xlsx', 'pdf']) format: 'xlsx' | 'pdf';
}

@ApiTags('finance')
@RequirePermissions(P.FINANCE_REPORTS)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() p: AuthPrincipal, @Query() q: PeriodQuery): Promise<FinanceDashboardDto> {
    return this.finance.dashboard(p.riadId, q.from, q.to);
  }

  /** 12-month P&L ending with the month of `to`, for the accountant. */
  @Get('pnl/export')
  async pnl(
    @CurrentUser() p: AuthPrincipal,
    @Query() q: PnlExportQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const [months, categories, riad] = await Promise.all([
      this.finance.monthly(p.riadId, q.to, 12),
      this.prisma.expenseCategory.findMany({ where: { riadId: p.riadId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.riad.findUniqueOrThrow({ where: { id: p.riadId }, select: { name: true } }),
    ]);
    const table = buildPnl(
      months.map((m) => ({ month: m.month, metrics: m.metrics, expensesByCategory: m.expensesByCategory })),
      categories,
    );
    const title = `Compte de résultat ${months[0]!.month} à ${months[months.length - 1]!.month}`;
    const body = q.format === 'xlsx' ? await pnlToXlsx(table, title) : await pnlToPdf(table, title, riad.name);
    await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'finance.pnl_export', entity: 'Finance', diff: { to: q.to, format: q.format } });
    res.set({
      'Content-Type': q.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
      'Content-Disposition': `attachment; filename="compte-resultat_${q.to.slice(0, 7)}.${q.format}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(body);
  }
}
