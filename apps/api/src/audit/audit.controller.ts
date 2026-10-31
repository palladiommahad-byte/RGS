import { Controller, Get, Query } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import {
  addDays,
  AUDIT_AREA_KEYS,
  AUDIT_AREAS,
  PERMISSIONS as P,
  zonedMidnight,
  type AuditArea,
  type AuditLogDto,
  type Paginated,
} from '@riad/shared';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { pageArgs, paginated, PaginationQueryDto } from '../common/pagination';
import { IsIsoDate } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';

export class ListAuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AUDIT_AREA_KEYS }) @IsOptional() @IsIn(AUDIT_AREA_KEYS) area?: AuditArea;
  @ApiPropertyOptional() @IsOptional() @IsUUID() userId?: string;
  @ApiPropertyOptional({ description: 'First day, YYYY-MM-DD (riad time)' }) @IsOptional() @IsIsoDate() from?: string;
  @ApiPropertyOptional({ description: 'Last day, YYYY-MM-DD (riad time)' }) @IsOptional() @IsIsoDate() to?: string;
}

/** Read-only view of the audit trail, newest first. */
@ApiTags('audit')
@RequirePermissions(P.AUDIT_READ)
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() p: AuthPrincipal, @Query() q: ListAuditQueryDto): Promise<Paginated<AuditLogDto>> {
    const createdAt: Prisma.DateTimeFilter = {};
    if (q.from) createdAt.gte = zonedMidnight(q.from);
    if (q.to) createdAt.lt = zonedMidnight(addDays(q.to, 1));
    const where: Prisma.AuditLogWhereInput = {
      riadId: p.riadId,
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.from || q.to ? { createdAt } : {}),
      ...(q.area ? { OR: AUDIT_AREAS[q.area].map((s) => ({ action: { startsWith: `${s}.` } })) } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(q),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        diff: r.diff && typeof r.diff === 'object' && !Array.isArray(r.diff) ? (r.diff as Record<string, unknown>) : null,
        createdAt: r.createdAt.toISOString(),
        user: r.user,
      })),
      total,
      q,
    );
  }

  /** Everyone who can appear in the log (deactivated accounts included), for the filter. */
  @Get('users')
  users(@CurrentUser() p: AuthPrincipal): Promise<{ id: string; name: string }[]> {
    return this.prisma.user.findMany({ where: { riadId: p.riadId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
}
