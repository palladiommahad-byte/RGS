import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { PERMISSIONS as P, TAX_CODES, TAX_MODES, type TaxCode, type TaxMode, type TaxReportDto, type TaxSettingDto } from '@riad/shared';
import { IsIn, IsInt, IsOptional, Matches, Min, ValidateIf } from 'class-validator';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { IsIsoDate } from '../common/validation';
import { TaxesService } from './taxes.service';

class TaxSettingBody {
  @ApiProperty({ enum: TAX_CODES }) @IsIn(TAX_CODES) code: TaxCode;
  @ApiProperty({ enum: TAX_MODES }) @IsIn(TAX_MODES) mode: TaxMode;
  @ApiProperty({ description: 'Basis points for PERCENT (10 % = 1000), centimes for PER_PERSON_PER_NIGHT' })
  @IsInt()
  @Min(0)
  value: number;
  @ApiProperty({ example: '2026-01-01' }) @IsIsoDate() validFrom: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsIsoDate() validTo?: string | null;
}

class UpdateTaxSettingBody extends PartialType(TaxSettingBody) {}

class MonthQuery {
  @ApiProperty({ example: '2026-10' }) @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month: string;
}

@ApiTags('taxes')
@Controller()
export class TaxesController {
  constructor(
    private readonly taxes: TaxesService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermissions(P.TAX_SETTINGS)
  @Get('tax-settings')
  list(@CurrentUser() p: AuthPrincipal): Promise<TaxSettingDto[]> {
    return this.taxes.list(p);
  }

  @RequirePermissions(P.TAX_SETTINGS)
  @Post('tax-settings')
  create(@CurrentUser() p: AuthPrincipal, @Body() dto: TaxSettingBody): Promise<TaxSettingDto> {
    return this.taxes.create(p, dto);
  }

  @RequirePermissions(P.TAX_SETTINGS)
  @Patch('tax-settings/:id')
  update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxSettingBody,
  ): Promise<TaxSettingDto> {
    return this.taxes.update(p, id, dto);
  }

  @RequirePermissions(P.TAX_SETTINGS)
  @Delete('tax-settings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.taxes.remove(p, id);
  }

  @RequirePermissions(P.FINANCE_REPORTS)
  @Get('tax-report')
  async report(@CurrentUser() p: AuthPrincipal, @Query() q: MonthQuery): Promise<TaxReportDto> {
    const { invoices, expenses, ...summary } = await this.taxes.report(p.riadId, q.month);
    return summary;
  }

  /** Excel file for the accountant: summary, invoices, deductible TVA. */
  @RequirePermissions(P.FINANCE_REPORTS)
  @Get('tax-report/export')
  async export(
    @CurrentUser() p: AuthPrincipal,
    @Query() q: MonthQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const body = await this.taxes.reportXlsx(p.riadId, q.month);
    await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'tax_report.export', entity: 'Finance', diff: { month: q.month } });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="declaration-taxes_${q.month}.xlsx"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(body);
  }
}
