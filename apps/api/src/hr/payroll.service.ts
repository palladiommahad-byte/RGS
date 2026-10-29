import { HttpStatus, Injectable } from '@nestjs/common';
import type { Employee, PayrollEntry, Prisma } from '@prisma/client';
import {
  addMonths,
  isoToUtcDate,
  leaveDaysInMonth,
  payrollNet,
  todayIso,
  utcDateToIso,
  type ExpensePaymentMethod,
  type PayrollEntryDto,
  type PayrollMonthDto,
} from '@riad/shared';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { diffFields } from '../common/diff';
import { PrismaService } from '../prisma/prisma.service';
import { fullName } from './employees.service';
import type { PayPayrollDto, UpdatePayrollDto } from './hr.dto';
import { payrollExpenseData } from './payroll-expense';

type Tx = Prisma.TransactionClient;
type EntryRow = PayrollEntry & { employee: Employee };

const monthDate = (month: string) => isoToUtcDate(`${month}-01`);
const nextMonthDate = (month: string) => isoToUtcDate(addMonths(`${month}-01`, 1));

/**
 * Monthly payroll: a draft generated from base salaries, edited (bonuses, advances,
 * deductions), then marked paid — which creates the matching "Salaries" expense in the
 * same transaction. Paid lines are frozen until the payment is cancelled.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async month(p: AuthPrincipal, month: string): Promise<PayrollMonthDto> {
    const first = monthDate(month);
    const next = nextMonthDate(month);
    const [rows, unpaidLeaves, eligible] = await Promise.all([
      this.prisma.payrollEntry.findMany({
        where: { riadId: p.riadId, month: first },
        include: { employee: true },
        orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
      }),
      this.prisma.leave.findMany({
        where: { riadId: p.riadId, type: 'UNPAID', status: 'APPROVED', startDate: { lt: next }, endDate: { gte: first } },
      }),
      this.eligibleEmployees(p.riadId, month),
    ]);
    const entries = rows.map((r) => toEntryDto(r, month, unpaidLeaves));
    const sum = (pick: (e: PayrollEntryDto) => number) => entries.reduce((n, e) => n + pick(e), 0);
    const withEntry = new Set(rows.map((r) => r.employeeId));
    return {
      month,
      entries,
      totals: {
        baseSalary: sum((e) => e.baseSalary),
        bonuses: sum((e) => e.bonuses),
        advances: sum((e) => e.advances),
        deductions: sum((e) => e.deductions),
        netPaid: sum((e) => e.netPaid),
        paid: sum((e) => (e.paidAt ? e.netPaid : 0)),
      },
      missing: eligible.filter((e) => !withEntry.has(e.id)).length,
    };
  }

  /** Draft lines for active employees hired by the end of the month; existing lines are kept. */
  async generate(p: AuthPrincipal, month: string): Promise<PayrollMonthDto> {
    const employees = await this.eligibleEmployees(p.riadId, month);
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.payrollEntry.createMany({
        data: employees.map((e) => ({
          riadId: p.riadId,
          employeeId: e.id,
          month: monthDate(month),
          baseSalary: e.baseSalary,
          netPaid: e.baseSalary,
          createdBy: p.userId,
        })),
        skipDuplicates: true,
      });
      await this.audit.log(
        { riadId: p.riadId, userId: p.userId, action: 'payroll.generate', entity: 'PayrollEntry', diff: { month, created: res.count } },
        tx,
      );
    });
    return this.month(p, month);
  }

  async update(p: AuthPrincipal, id: string, dto: UpdatePayrollDto): Promise<PayrollEntryDto> {
    const before = await this.findOrThrow(p.riadId, id);
    if (before.paidAt) throw paidError();
    const amounts = {
      baseSalary: before.baseSalary,
      bonuses: dto.bonuses ?? before.bonuses,
      advances: dto.advances ?? before.advances,
      deductions: dto.deductions ?? before.deductions,
    };
    const netPaid = payrollNet(amounts);
    if (netPaid < 0) throw new AppException('NEGATIVE_NET', 'Advances and deductions exceed the salary');
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.payrollEntry.updateMany({ where: { id, paidAt: null }, data: { ...amounts, netPaid } });
      if (res.count === 0) throw paidError();
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'payroll.update',
          entity: 'PayrollEntry',
          entityId: id,
          diff: diffFields(before, { ...amounts, netPaid }, ['bonuses', 'advances', 'deductions', 'netPaid']),
        },
        tx,
      );
    });
    return this.entryDto(p.riadId, id);
  }

  async pay(p: AuthPrincipal, id: string, dto: PayPayrollDto): Promise<PayrollEntryDto> {
    await this.findOrThrow(p.riadId, id);
    const categoryId = await this.salariesCategory(p.riadId);
    await this.prisma.$transaction((tx) => this.payOne(tx, p, id, categoryId, dto.date ?? todayIso(), dto.paymentMethod ?? 'TRANSFER'));
    return this.entryDto(p.riadId, id);
  }

  /** Pays every unpaid line of the month at once. */
  async payMonth(p: AuthPrincipal, month: string, dto: PayPayrollDto): Promise<{ paid: number }> {
    const categoryId = await this.salariesCategory(p.riadId);
    const unpaid = await this.prisma.payrollEntry.findMany({ where: { riadId: p.riadId, month: monthDate(month), paidAt: null }, select: { id: true } });
    await this.prisma.$transaction(async (tx) => {
      for (const { id } of unpaid) await this.payOne(tx, p, id, categoryId, dto.date ?? todayIso(), dto.paymentMethod ?? 'TRANSFER');
    });
    return { paid: unpaid.length };
  }

  /** Cancels a payment recorded by mistake: the line is editable again and its expense is deleted. */
  async unpay(p: AuthPrincipal, id: string): Promise<PayrollEntryDto> {
    await this.findOrThrow(p.riadId, id);
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.payrollEntry.updateMany({ where: { id, riadId: p.riadId, paidAt: { not: null } }, data: { paidAt: null } });
      if (res.count === 0) throw new AppException('PAYROLL_NOT_PAID', 'This line is not paid', HttpStatus.CONFLICT);
      const expense = await tx.expense.findUnique({ where: { payrollEntryId: id } });
      if (expense) await tx.expense.delete({ where: { id: expense.id } });
      await this.audit.log(
        { riadId: p.riadId, userId: p.userId, action: 'payroll.unpay', entity: 'PayrollEntry', entityId: id, diff: { expenseId: expense?.id ?? null } },
        tx,
      );
    });
    return this.entryDto(p.riadId, id);
  }

  async remove(p: AuthPrincipal, id: string): Promise<void> {
    const before = await this.findOrThrow(p.riadId, id);
    if (before.paidAt) throw paidError();
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.payrollEntry.deleteMany({ where: { id, paidAt: null } });
      if (res.count === 0) throw paidError();
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'payroll.delete',
          entity: 'PayrollEntry',
          entityId: id,
          diff: { employeeId: before.employeeId, month: utcDateToIso(before.month).slice(0, 7) },
        },
        tx,
      );
    });
  }

  async xlsx(p: AuthPrincipal, month: string): Promise<Buffer> {
    const data = await this.month(p, month);
    const employees = await this.prisma.employee.findMany({
      where: { riadId: p.riadId, id: { in: data.entries.map((e) => e.employee.id) } },
      select: { id: true, cnssNumber: true },
    });
    const cnss = new Map(employees.map((e) => [e.id, e.cnssNumber]));
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(`Paie ${month}`);
    sheet.columns = [
      { width: 28 },
      { width: 20 },
      { width: 16 },
      { width: 14 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 14 },
      { width: 12 },
    ];
    sheet.addRow([`Paie ${month}`]).font = { bold: true, size: 13 };
    sheet.addRow(['Montants en dirhams (MAD). Charges sociales et IR à calculer par votre comptable.']).font = { italic: true, size: 9 };
    const header = sheet.addRow(['Employé', 'Poste', 'N° CNSS', 'Salaire de base', 'Primes', 'Avances', 'Retenues', 'Net payé', 'Payé le']);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E48' } }));
    const money = (c: number) => c / 100;
    for (const e of data.entries) {
      const row = sheet.addRow([
        e.employee.name,
        e.employee.position,
        cnss.get(e.employee.id) ?? '',
        money(e.baseSalary),
        money(e.bonuses),
        money(e.advances),
        money(e.deductions),
        money(e.netPaid),
        e.paidAt ? e.paidAt.slice(0, 10) : '',
      ]);
      for (let i = 4; i <= 8; i++) row.getCell(i).numFmt = '#,##0.00';
    }
    const t = data.totals;
    const total = sheet.addRow(['Total', '', '', money(t.baseSalary), money(t.bonuses), money(t.advances), money(t.deductions), money(t.netPaid), '']);
    total.font = { bold: true };
    for (let i = 4; i <= 8; i++) total.getCell(i).numFmt = '#,##0.00';
    await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'payroll.export', entity: 'PayrollEntry', diff: { month } });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async payOne(tx: Tx, p: AuthPrincipal, id: string, categoryId: string, date: string, method: ExpensePaymentMethod): Promise<void> {
    // Conditional update: a line can only be paid once, even with two clicks at the same time.
    const res = await tx.payrollEntry.updateMany({ where: { id, riadId: p.riadId, paidAt: null }, data: { paidAt: new Date() } });
    if (res.count === 0) throw paidError();
    const entry = await tx.payrollEntry.findUniqueOrThrow({ where: { id } });
    const data = payrollExpenseData(entry, categoryId, date, method, p.userId);
    const expense = data ? await tx.expense.create({ data }) : null;
    await this.audit.log(
      {
        riadId: p.riadId,
        userId: p.userId,
        action: 'payroll.pay',
        entity: 'PayrollEntry',
        entityId: id,
        diff: { netPaid: entry.netPaid, date, method, expenseId: expense?.id ?? null },
      },
      tx,
    );
  }

  private async salariesCategory(riadId: string): Promise<string> {
    const c = await this.prisma.expenseCategory.findFirst({ where: { riadId, key: 'SALARIES' }, select: { id: true } });
    if (!c) throw new AppException('NO_SALARY_CATEGORY', 'The "Salaries" expense category is missing', HttpStatus.CONFLICT);
    return c.id;
  }

  private eligibleEmployees(riadId: string, month: string): Promise<Employee[]> {
    return this.prisma.employee.findMany({ where: { riadId, isActive: true, hireDate: { lt: nextMonthDate(month) } } });
  }

  private async findOrThrow(riadId: string, id: string): Promise<PayrollEntry> {
    const e = await this.prisma.payrollEntry.findFirst({ where: { id, riadId } });
    if (!e) throw new AppException('NOT_FOUND', 'Payroll line not found', HttpStatus.NOT_FOUND);
    return e;
  }

  private async entryDto(riadId: string, id: string): Promise<PayrollEntryDto> {
    const row = await this.prisma.payrollEntry.findFirstOrThrow({ where: { id, riadId }, include: { employee: true } });
    const month = utcDateToIso(row.month).slice(0, 7);
    const leaves = await this.prisma.leave.findMany({
      where: { employeeId: row.employeeId, type: 'UNPAID', status: 'APPROVED', startDate: { lt: nextMonthDate(month) }, endDate: { gte: monthDate(month) } },
    });
    return toEntryDto(row, month, leaves);
  }
}

function paidError(): AppException {
  return new AppException('PAYROLL_PAID', 'This line is already paid: cancel the payment first', HttpStatus.CONFLICT);
}

function toEntryDto(r: EntryRow, month: string, unpaidLeaves: { employeeId: string; startDate: Date; endDate: Date }[]): PayrollEntryDto {
  return {
    id: r.id,
    employee: { id: r.employeeId, name: fullName(r.employee), position: r.employee.position },
    month,
    baseSalary: r.baseSalary,
    bonuses: r.bonuses,
    advances: r.advances,
    deductions: r.deductions,
    netPaid: r.netPaid,
    paidAt: r.paidAt?.toISOString() ?? null,
    unpaidLeaveDays: unpaidLeaves
      .filter((l) => l.employeeId === r.employeeId)
      .reduce((n, l) => n + leaveDaysInMonth(utcDateToIso(l.startDate), utcDateToIso(l.endDate), month), 0),
  };
}
