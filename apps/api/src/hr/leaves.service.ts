import { HttpStatus, Injectable } from '@nestjs/common';
import type { Employee, Leave, LeaveStatus, Prisma } from '@prisma/client';
import { isoToUtcDate, leaveDays, utcDateToIso, type LeaveDto, type Paginated } from '@riad/shared';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { diffFields } from '../common/diff';
import { pageArgs, paginated } from '../common/pagination';
import { loadUserNames } from '../expenses/expense.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { fullName } from './employees.service';
import type { CreateLeaveDto, ListLeavesQueryDto, UpdateLeaveDto } from './hr.dto';

type LeaveRow = Leave & { employee: Employee };
type Tx = Prisma.TransactionClient;

/**
 * Leave requests. Employees have no account, so a manager records the request and then
 * approves or rejects it. Pending and approved leaves of one employee may not overlap.
 */
@Injectable()
export class LeavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(p: AuthPrincipal, q: ListLeavesQueryDto): Promise<Paginated<LeaveDto>> {
    const where: Prisma.LeaveWhereInput = { riadId: p.riadId };
    if (q.status) where.status = q.status;
    if (q.employeeId) where.employeeId = q.employeeId;
    const [rows, total] = await this.prisma.$transaction([
      // Pending first (they need a decision), then the most recent.
      this.prisma.leave.findMany({ where, include: { employee: true }, orderBy: [{ status: 'asc' }, { startDate: 'desc' }], ...pageArgs(q) }),
      this.prisma.leave.count({ where }),
    ]);
    return paginated(await this.toDtos(p.riadId, rows), total, q);
  }

  async create(p: AuthPrincipal, dto: CreateLeaveDto): Promise<LeaveDto> {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, riadId: p.riadId } });
    if (!employee) throw new AppException('NOT_FOUND', 'Employee not found', HttpStatus.NOT_FOUND);
    assertRange(dto.startDate, dto.endDate);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.assertNoOverlap(tx, employee.id, dto.startDate, dto.endDate);
      const created = await tx.leave.create({
        data: {
          riadId: p.riadId,
          employeeId: employee.id,
          type: dto.type,
          startDate: isoToUtcDate(dto.startDate),
          endDate: isoToUtcDate(dto.endDate),
          note: dto.note,
          createdBy: p.userId,
        },
        include: { employee: true },
      });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'leave.create',
          entity: 'Leave',
          entityId: created.id,
          diff: { employeeId: employee.id, type: dto.type, startDate: dto.startDate, endDate: dto.endDate },
        },
        tx,
      );
      return created;
    });
    return (await this.toDtos(p.riadId, [row]))[0]!;
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateLeaveDto): Promise<LeaveDto> {
    const before = await this.findOrThrow(p.riadId, id);
    if (before.status !== 'PENDING') {
      throw new AppException('LEAVE_DECIDED', 'Only pending requests can be edited', HttpStatus.CONFLICT);
    }
    if (dto.employeeId && dto.employeeId !== before.employeeId) {
      throw new AppException('INVALID_INPUT', 'The employee of a request cannot change');
    }
    const startDate = dto.startDate ?? utcDateToIso(before.startDate);
    const endDate = dto.endDate ?? utcDateToIso(before.endDate);
    assertRange(startDate, endDate);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.assertNoOverlap(tx, before.employeeId, startDate, endDate, id);
      const updated = await tx.leave.update({
        where: { id },
        data: { type: dto.type, startDate: isoToUtcDate(startDate), endDate: isoToUtcDate(endDate), note: dto.note },
        include: { employee: true },
      });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'leave.update',
          entity: 'Leave',
          entityId: id,
          diff: diffFields(before, updated, ['type', 'startDate', 'endDate', 'note']),
        },
        tx,
      );
      return updated;
    });
    return (await this.toDtos(p.riadId, [row]))[0]!;
  }

  /** Approve or reject a pending request (atomic: two managers cannot both decide). */
  async decide(p: AuthPrincipal, id: string, status: Exclude<LeaveStatus, 'PENDING'>): Promise<LeaveDto> {
    await this.findOrThrow(p.riadId, id);
    const row = await this.prisma.$transaction(async (tx) => {
      const res = await tx.leave.updateMany({
        where: { id, riadId: p.riadId, status: 'PENDING' },
        data: { status, decidedBy: p.userId, decidedAt: new Date() },
      });
      if (res.count === 0) throw new AppException('LEAVE_DECIDED', 'This request was already decided', HttpStatus.CONFLICT);
      await this.audit.log({ riadId: p.riadId, userId: p.userId, action: `leave.${status.toLowerCase()}`, entity: 'Leave', entityId: id }, tx);
      return tx.leave.findUniqueOrThrow({ where: { id }, include: { employee: true } });
    });
    return (await this.toDtos(p.riadId, [row]))[0]!;
  }

  async remove(p: AuthPrincipal, id: string): Promise<void> {
    const before = await this.findOrThrow(p.riadId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.leave.delete({ where: { id } });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'leave.delete',
          entity: 'Leave',
          entityId: id,
          diff: { employeeId: before.employeeId, status: before.status, startDate: utcDateToIso(before.startDate), endDate: utcDateToIso(before.endDate) },
        },
        tx,
      );
    });
  }

  private async assertNoOverlap(tx: Tx, employeeId: string, start: string, end: string, exceptId?: string): Promise<void> {
    const clash = await tx.leave.findFirst({
      where: {
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: isoToUtcDate(end) },
        endDate: { gte: isoToUtcDate(start) },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) {
      throw new AppException('LEAVE_OVERLAP', 'This employee already has leave on these dates', HttpStatus.CONFLICT, {
        startDate: utcDateToIso(clash.startDate),
        endDate: utcDateToIso(clash.endDate),
      });
    }
  }

  private async findOrThrow(riadId: string, id: string): Promise<Leave> {
    const l = await this.prisma.leave.findFirst({ where: { id, riadId } });
    if (!l) throw new AppException('NOT_FOUND', 'Leave not found', HttpStatus.NOT_FOUND);
    return l;
  }

  private async toDtos(riadId: string, rows: LeaveRow[]): Promise<LeaveDto[]> {
    const users = await loadUserNames(this.prisma, riadId, rows.map((r) => r.decidedBy));
    return rows.map((l) => {
      const startDate = utcDateToIso(l.startDate);
      const endDate = utcDateToIso(l.endDate);
      return {
        id: l.id,
        employee: { id: l.employeeId, name: fullName(l.employee) },
        type: l.type,
        startDate,
        endDate,
        days: leaveDays(startDate, endDate),
        status: l.status,
        note: l.note,
        decidedBy: l.decidedBy ? { id: l.decidedBy, name: users.get(l.decidedBy)?.name ?? '—' } : null,
        decidedAt: l.decidedAt?.toISOString() ?? null,
      };
    });
  }
}

function assertRange(start: string, end: string): void {
  if (end < start) throw new AppException('INVALID_DATES', 'The end date is before the start date');
}
