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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Supplier } from '@prisma/client';
import { PERMISSIONS as P, type Paginated, type SupplierDto as SupplierView } from '@riad/shared';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { pageArgs, paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ListSuppliersQueryDto, SupplierDto, UpdateSupplierDto } from './expenses.dto';
import { searchSupplierIds } from './suppliers';

type Row = Supplier & { _count: { expenses: number } };
const toView = (s: Row): SupplierView => ({
  id: s.id,
  name: s.name,
  phone: s.phone,
  defaultCategoryId: s.defaultCategoryId,
  expenseCount: s._count.expenses,
});

/** Suppliers: searchable by anyone who records expenses (autocomplete), managed by managers. */
@ApiTags('expenses')
@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @RequireAnyPermission(P.EXPENSES_WRITE, P.EXPENSES_WRITE_PETTY_CASH, P.EXPENSES_READ_ALL)
  @Get()
  async list(@CurrentUser() p: AuthPrincipal, @Query() q: ListSuppliersQueryDto): Promise<Paginated<SupplierView>> {
    const where = {
      riadId: p.riadId,
      ...(q.search ? { id: { in: await searchSupplierIds(this.prisma, p.riadId, q.search) } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        include: { _count: { select: { expenses: true } } },
        orderBy: { name: 'asc' },
        ...pageArgs(q),
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginated(rows.map(toView), total, q);
  }

  @RequirePermissions(P.EXPENSES_WRITE)
  @Post()
  async create(@CurrentUser() p: AuthPrincipal, @Body() dto: SupplierDto): Promise<SupplierView> {
    if (dto.defaultCategoryId) await this.assertCategory(p.riadId, dto.defaultCategoryId);
    const row = await this.prisma.supplier.create({
      data: { ...dto, riadId: p.riadId, createdBy: p.userId },
      include: { _count: { select: { expenses: true } } },
    });
    await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'supplier.create', entity: 'Supplier', entityId: row.id });
    return toView(row);
  }

  @RequirePermissions(P.EXPENSES_WRITE)
  @Patch(':id')
  async update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierView> {
    await this.findOrThrow(p.riadId, id);
    if (dto.defaultCategoryId) await this.assertCategory(p.riadId, dto.defaultCategoryId);
    const row = await this.prisma.supplier.update({
      where: { id },
      data: dto,
      include: { _count: { select: { expenses: true } } },
    });
    await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'supplier.update', entity: 'Supplier', entityId: id });
    return toView(row);
  }

  @RequirePermissions(P.EXPENSES_WRITE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.findOrThrow(p.riadId, id);
    const used = await this.prisma.supplier.findFirst({
      where: { id, OR: [{ expenses: { some: {} } }, { recurringExpenses: { some: {} } }] },
    });
    if (used) throw new AppException('SUPPLIER_IN_USE', 'This supplier has expenses', HttpStatus.CONFLICT);
    await this.prisma.supplier.delete({ where: { id } });
    await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'supplier.delete', entity: 'Supplier', entityId: id });
  }

  private async findOrThrow(riadId: string, id: string): Promise<Supplier> {
    const s = await this.prisma.supplier.findFirst({ where: { id, riadId } });
    if (!s) throw new AppException('NOT_FOUND', 'Supplier not found', HttpStatus.NOT_FOUND);
    return s;
  }

  private async assertCategory(riadId: string, id: string): Promise<void> {
    const c = await this.prisma.expenseCategory.findFirst({ where: { id, riadId } });
    if (!c) throw new AppException('NOT_FOUND', 'Category not found', HttpStatus.NOT_FOUND);
  }
}
