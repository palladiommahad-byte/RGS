import { HttpStatus, Injectable } from '@nestjs/common';
import type { Attendance } from '@prisma/client';
import {
  clockDecision,
  leaveDaysInMonth,
  localDate,
  minutesBetween,
  monthInstants,
  utcDateToIso,
  type AttendanceRecordDto,
  type AttendanceReportDto,
  type ClockResultDto,
} from '@riad/shared';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { PrismaService } from '../prisma/prisma.service';
import { fullName } from './employees.service';
import type { AttendanceDto, UpdateAttendanceDto } from './hr.dto';

const MAX_MANUAL_SHIFT_MS = 24 * 3_600_000;

export function toRecordDto(a: Attendance): AttendanceRecordDto {
  return {
    id: a.id,
    employeeId: a.employeeId,
    date: localDate(a.checkInAt),
    checkInAt: a.checkInAt.toISOString(),
    checkOutAt: a.checkOutAt?.toISOString() ?? null,
    minutes: a.checkOutAt ? minutesBetween(a.checkInAt, a.checkOutAt) : null,
  };
}

/** Badge clock-in/out from the reception tablet, monthly report and manual corrections. */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * One scan = check in, or check out the open shift. Scans for the same employee are
   * serialised with a row lock, so a double scan can never open two shifts.
   */
  async clock(p: AuthPrincipal, token: string, now = new Date()): Promise<ClockResultDto> {
    const employee = await this.prisma.employee.findFirst({ where: { riadId: p.riadId, clockToken: token } });
    if (!employee) throw new AppException('BADGE_UNKNOWN', 'Unknown badge', HttpStatus.NOT_FOUND);
    if (!employee.isActive) throw new AppException('EMPLOYEE_INACTIVE', 'This badge is no longer active', HttpStatus.FORBIDDEN);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employee.id}::uuid FOR UPDATE`;
      const last = await tx.attendance.findFirst({ where: { employeeId: employee.id }, orderBy: { checkInAt: 'desc' } });
      const open = last && !last.checkOutAt ? last : null;
      const lastEventAt = last ? (last.checkOutAt ?? last.checkInAt) : null;
      const action = clockDecision(open?.checkInAt ?? null, lastEventAt, now);
      const base = { action, firstName: employee.firstName, at: now.toISOString(), minutes: null };

      if (action === 'DUPLICATE') return { ...base, at: (lastEventAt ?? now).toISOString() };
      if (action === 'OUT' && open) {
        await tx.attendance.update({ where: { id: open.id }, data: { checkOutAt: now } });
        return { ...base, minutes: minutesBetween(open.checkInAt, now) };
      }
      await tx.attendance.create({ data: { riadId: p.riadId, employeeId: employee.id, checkInAt: now } });
      return base;
    });
  }

  async report(p: AuthPrincipal, month: string): Promise<AttendanceReportDto> {
    const { start, end } = monthInstants(month);
    const first = new Date(`${month}-01T00:00:00Z`);
    const [records, employees, leaves] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { riadId: p.riadId, checkInAt: { gte: start, lt: end } },
        orderBy: { checkInAt: 'asc' },
      }),
      this.prisma.employee.findMany({ where: { riadId: p.riadId }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
      this.prisma.leave.findMany({
        where: { riadId: p.riadId, status: 'APPROVED', startDate: { lt: new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)) }, endDate: { gte: first } },
      }),
    ]);

    const rows = employees
      .map((e) => {
        const own = records.filter((r) => r.employeeId === e.id).map(toRecordDto);
        const leaveDays = leaves
          .filter((l) => l.employeeId === e.id)
          .reduce((n, l) => n + leaveDaysInMonth(utcDateToIso(l.startDate), utcDateToIso(l.endDate), month), 0);
        return {
          employee: { id: e.id, name: fullName(e), position: e.position, isActive: e.isActive },
          daysWorked: new Set(own.map((r) => r.date)).size,
          minutes: own.reduce((n, r) => n + (r.minutes ?? 0), 0),
          openShifts: own.filter((r) => r.minutes === null).length,
          leaveDays,
          records: own,
        };
      })
      // Former employees only appear for months where they have something to show.
      .filter((r) => r.employee.isActive || r.records.length > 0 || r.leaveDays > 0)
      .map(({ employee: { isActive: _active, ...employee }, ...rest }) => ({ employee, ...rest }));
    return { month, employees: rows };
  }

  async create(p: AuthPrincipal, dto: AttendanceDto): Promise<AttendanceRecordDto> {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, riadId: p.riadId } });
    if (!employee) throw new AppException('NOT_FOUND', 'Employee not found', HttpStatus.NOT_FOUND);
    const checkInAt = new Date(dto.checkInAt);
    const checkOutAt = dto.checkOutAt ? new Date(dto.checkOutAt) : null;
    assertShift(checkInAt, checkOutAt);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attendance.create({ data: { riadId: p.riadId, employeeId: employee.id, checkInAt, checkOutAt } });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'attendance.create',
          entity: 'Attendance',
          entityId: created.id,
          diff: { employeeId: employee.id, checkInAt: checkInAt.toISOString(), checkOutAt: checkOutAt?.toISOString() ?? null },
        },
        tx,
      );
      return created;
    });
    return toRecordDto(row);
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateAttendanceDto): Promise<AttendanceRecordDto> {
    const before = await this.findOrThrow(p.riadId, id);
    const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : before.checkInAt;
    const checkOutAt = dto.checkOutAt === undefined ? before.checkOutAt : dto.checkOutAt ? new Date(dto.checkOutAt) : null;
    assertShift(checkInAt, checkOutAt);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendance.update({ where: { id }, data: { checkInAt, checkOutAt } });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'attendance.update',
          entity: 'Attendance',
          entityId: id,
          diff: {
            checkInAt: [before.checkInAt.toISOString(), checkInAt.toISOString()],
            checkOutAt: [before.checkOutAt?.toISOString() ?? null, checkOutAt?.toISOString() ?? null],
          },
        },
        tx,
      );
      return updated;
    });
    return toRecordDto(row);
  }

  async remove(p: AuthPrincipal, id: string): Promise<void> {
    const before = await this.findOrThrow(p.riadId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.attendance.delete({ where: { id } });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'attendance.delete',
          entity: 'Attendance',
          entityId: id,
          diff: { employeeId: before.employeeId, checkInAt: before.checkInAt.toISOString(), checkOutAt: before.checkOutAt?.toISOString() ?? null },
        },
        tx,
      );
    });
  }

  private async findOrThrow(riadId: string, id: string): Promise<Attendance> {
    const a = await this.prisma.attendance.findFirst({ where: { id, riadId } });
    if (!a) throw new AppException('NOT_FOUND', 'Attendance not found', HttpStatus.NOT_FOUND);
    return a;
  }
}

function assertShift(checkInAt: Date, checkOutAt: Date | null): void {
  if (checkOutAt && (checkOutAt <= checkInAt || checkOutAt.getTime() - checkInAt.getTime() > MAX_MANUAL_SHIFT_MS)) {
    throw new AppException('INVALID_SHIFT', 'Check-out must be after check-in, within 24 hours');
  }
  if (checkInAt.getTime() > Date.now() + 5 * 60_000) {
    throw new AppException('INVALID_SHIFT', 'Check-in cannot be in the future');
  }
}
