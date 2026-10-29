import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  localDate,
  type AttendanceReportDto,
  type ClockResultDto,
  type EmployeeBadgeDto,
  type EmployeeDto,
  type LeaveDto,
  type Paginated,
  type PayrollMonthDto,
} from '@riad/shared';
import type TestAgent from 'supertest/lib/agent';
import { StorageService } from '../src/storage/storage.service';
import { createApp, createRiad, FakeStorage, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';
const HOUR = 3_600_000;

describe('HR (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let storage: FakeStorage;
  let a: RiadFixture;
  let b: RiadFixture;
  let manager: TestAgent;
  let reception: TestAgent;
  let housekeeping: TestAgent;
  let ownerB: TestAgent;
  let salariesId: string;

  const employee = (body: Partial<Record<string, unknown>> = {}) =>
    manager
      .post(`${API}/hr/employees`)
      .send({
        firstName: 'Fatima',
        lastName: 'Zahra',
        position: 'Cuisinière',
        contractType: 'CDI',
        hireDate: '2026-01-01',
        baseSalary: 350000,
        ...body,
      })
      .expect(201)
      .then((r) => r.body as EmployeeDto);

  const tokenOf = async (id: string) => (await prisma.employee.findUniqueOrThrow({ where: { id } })).clockToken;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    b = await createRiad(prisma, 'Riad B');
    salariesId = (
      await prisma.expenseCategory.create({ data: { riadId: a.riadId, key: 'SALARIES', nameFr: 'Salaires', nameAr: 'الأجور', icon: 'users' } })
    ).id;
    storage = new FakeStorage();
    app = await createApp((builder) => builder.overrideProvider(StorageService).useValue(storage));
    manager = await loginAs(app, a.emails.MANAGER);
    reception = await loginAs(app, a.emails.RECEPTION);
    housekeeping = await loginAs(app, a.emails.HOUSEKEEPING);
    ownerB = await loginAs(app, b.emails.OWNER);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('access', () => {
    it('hides every HR route from reception and housekeeping', async () => {
      const e = await employee();
      for (const agent of [reception, housekeeping]) {
        await agent.get(`${API}/hr/employees`).expect(403);
        await agent.get(`${API}/hr/employees/${e.id}`).expect(403);
        await agent.get(`${API}/hr/employees/badges`).expect(403);
        await agent.get(`${API}/hr/employees/${e.id}/contract`).expect(403);
        await agent.get(`${API}/hr/attendance?month=2026-10`).expect(403);
        await agent.get(`${API}/hr/leaves`).expect(403);
        await agent.get(`${API}/hr/payroll?month=2026-10`).expect(403);
        await agent.get(`${API}/hr/payroll/export?month=2026-10`).expect(403);
        await agent.post(`${API}/hr/payroll/generate`).send({ month: '2026-10' }).expect(403);
        await agent.patch(`${API}/hr/employees/${e.id}`).send({ baseSalary: 1 }).expect(403);
      }
    });

    it('isolates riads', async () => {
      const e = await employee({ firstName: 'Isolée' });
      await ownerB.get(`${API}/hr/employees/${e.id}`).expect(404);
      const list = (await ownerB.get(`${API}/hr/employees`).expect(200)).body as Paginated<EmployeeDto>;
      expect(list.total).toBe(0);
      // A badge from riad A means nothing in riad B.
      const ownerBClock = await ownerB.post(`${API}/staff/clock`).send({ token: await tokenOf(e.id) }).expect(404);
      expect(ownerBClock.body.code).toBe('BADGE_UNKNOWN');
    });
  });

  describe('employees', () => {
    it('encrypts the CIN at rest, finds it by exact search and keeps it out of lists and audit', async () => {
      const e = await employee({ firstName: 'Ahmed', lastName: 'Alaoui', cin: 'be123456' });
      expect(e.cin).toBe('BE123456');
      const row = await prisma.employee.findUniqueOrThrow({ where: { id: e.id } });
      expect(row.cin).not.toContain('BE123456');
      expect(row.cinHash).toBeTruthy();

      const found = (await manager.get(`${API}/hr/employees?search=BE%20123456`).expect(200)).body as Paginated<EmployeeDto>;
      expect(found.items.map((x) => x.id)).toEqual([e.id]);
      expect(found.items[0]!.cin).toBeNull();
      expect(((await manager.get(`${API}/hr/employees/${e.id}`).expect(200)).body as EmployeeDto).cin).toBe('BE123456');

      const logs = await prisma.auditLog.findMany({ where: { entityId: e.id } });
      expect(JSON.stringify(logs)).not.toContain('BE123456');
    });

    it('updates, clears optional fields and audits salary changes', async () => {
      const e = await employee({ phone: '0600000000', cin: 'X1' });
      const res = await manager.patch(`${API}/hr/employees/${e.id}`).send({ baseSalary: 400000, phone: '' }).expect(200);
      expect(res.body).toMatchObject({ baseSalary: 400000, phone: null, cin: 'X1' });
      const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: e.id, action: 'employee.update' } });
      expect(log.diff).toMatchObject({ baseSalary: [350000, 400000] });
    });

    it('stores the contract privately and logs each view', async () => {
      const e = await employee();
      await manager
        .post(`${API}/hr/employees/${e.id}/contract`)
        .attach('file', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' })
        .expect(400);
      const up = await manager
        .post(`${API}/hr/employees/${e.id}/contract`)
        .attach('file', Buffer.from('%PDF-1.4 contract'), { filename: 'contrat.pdf', contentType: 'application/pdf' })
        .expect(201);
      expect(up.body.hasContract).toBe(true);
      expect(storage.has('documents', `riads/${a.riadId}/hr/contracts/${e.id}.pdf`)).toBe(true);
      const link = await manager.get(`${API}/hr/employees/${e.id}/contract`).expect(200);
      expect(link.body.url).toContain('expires=300');
      expect(await prisma.auditLog.count({ where: { entityId: e.id, action: 'employee.contract_view' } })).toBe(1);
    });

    it('deletes only employees without history', async () => {
      const fresh = await employee();
      await manager.delete(`${API}/hr/employees/${fresh.id}`).expect(204);
      const worked = await employee();
      await prisma.attendance.create({ data: { riadId: a.riadId, employeeId: worked.id, checkInAt: new Date() } });
      const res = await manager.delete(`${API}/hr/employees/${worked.id}`).expect(409);
      expect(res.body.code).toBe('EMPLOYEE_HAS_HISTORY');
    });

    it('rotates a lost badge', async () => {
      const e = await employee();
      const old = await tokenOf(e.id);
      const badge = (await manager.post(`${API}/hr/employees/${e.id}/badge/rotate`).expect(201)).body as EmployeeBadgeDto;
      expect(badge.token).not.toBe(old);
      await reception.post(`${API}/staff/clock`).send({ token: old }).expect(404);
    });
  });

  describe('staff clock', () => {
    it('lets any signed-in staff scan a badge and returns the first name only', async () => {
      const e = await employee({ firstName: 'Youssef', cin: 'AB999' });
      const res = await housekeeping.post(`${API}/staff/clock`).send({ token: await tokenOf(e.id) }).expect(200);
      const body = res.body as ClockResultDto;
      expect(Object.keys(body).sort()).toEqual(['action', 'at', 'firstName', 'minutes']);
      expect(body).toMatchObject({ action: 'IN', firstName: 'Youssef', minutes: null });
      // An immediate second scan is ignored.
      const again = await reception.post(`${API}/staff/clock`).send({ token: await tokenOf(e.id) }).expect(200);
      expect(again.body.action).toBe('DUPLICATE');
      expect(await prisma.attendance.count({ where: { employeeId: e.id } })).toBe(1);
    });

    it('checks out an open shift and counts the minutes', async () => {
      const e = await employee();
      await prisma.attendance.create({ data: { riadId: a.riadId, employeeId: e.id, checkInAt: new Date(Date.now() - 8 * HOUR) } });
      const res = await reception.post(`${API}/staff/clock`).send({ token: await tokenOf(e.id) }).expect(200);
      expect(res.body.action).toBe('OUT');
      expect(res.body.minutes).toBeGreaterThanOrEqual(479);
      const open = await prisma.attendance.count({ where: { employeeId: e.id, checkOutAt: null } });
      expect(open).toBe(0);
    });

    it('starts a new shift after a forgotten check-out', async () => {
      const e = await employee();
      await prisma.attendance.create({ data: { riadId: a.riadId, employeeId: e.id, checkInAt: new Date(Date.now() - 20 * HOUR) } });
      const res = await reception.post(`${API}/staff/clock`).send({ token: await tokenOf(e.id) }).expect(200);
      expect(res.body.action).toBe('IN');
      expect(await prisma.attendance.count({ where: { employeeId: e.id, checkOutAt: null } })).toBe(2);
    });

    it('never opens two shifts for simultaneous scans', async () => {
      const e = await employee();
      const token = await tokenOf(e.id);
      const results = await Promise.all([1, 2, 3].map(() => reception.post(`${API}/staff/clock`).send({ token })));
      expect(results.map((r) => r.body.action).sort()).toEqual(['DUPLICATE', 'DUPLICATE', 'IN']);
      expect(await prisma.attendance.count({ where: { employeeId: e.id } })).toBe(1);
    });

    it('refuses inactive and unknown badges', async () => {
      const e = await employee();
      await manager.patch(`${API}/hr/employees/${e.id}`).send({ isActive: false }).expect(200);
      expect((await reception.post(`${API}/staff/clock`).send({ token: await tokenOf(e.id) }).expect(403)).body.code).toBe('EMPLOYEE_INACTIVE');
      await reception.post(`${API}/staff/clock`).send({ token: 'x'.repeat(32) }).expect(404);
    });
  });

  describe('attendance report', () => {
    it('sums closed shifts per employee and lets the manager correct them', async () => {
      const e = await employee({ firstName: 'Rapport' });
      const start = new Date(Date.now() - 30 * HOUR);
      const bad = await manager
        .post(`${API}/hr/attendance`)
        .send({ employeeId: e.id, checkInAt: start.toISOString(), checkOutAt: new Date(start.getTime() - HOUR).toISOString() })
        .expect(400);
      expect(bad.body.code).toBe('INVALID_SHIFT');
      const rec = await manager
        .post(`${API}/hr/attendance`)
        .send({ employeeId: e.id, checkInAt: start.toISOString(), checkOutAt: new Date(start.getTime() + 7.5 * HOUR).toISOString() })
        .expect(201);
      expect(rec.body.minutes).toBe(450);
      await manager
        .patch(`${API}/hr/attendance/${rec.body.id}`)
        .send({ checkOutAt: new Date(start.getTime() + 8 * HOUR).toISOString() })
        .expect(200);

      const month = localDate(start).slice(0, 7);
      const report = (await manager.get(`${API}/hr/attendance?month=${month}`).expect(200)).body as AttendanceReportDto;
      const row = report.employees.find((x) => x.employee.id === e.id)!;
      expect(row).toMatchObject({ daysWorked: 1, minutes: 480, openShifts: 0 });
      expect(await prisma.auditLog.count({ where: { entityId: rec.body.id } })).toBe(2);
      await manager.get(`${API}/hr/attendance?month=2026-13`).expect(400);
    });
  });

  describe('leaves', () => {
    it('refuses overlaps, decides once, and freezes decided requests', async () => {
      const e = await employee();
      const leave = (await manager
        .post(`${API}/hr/leaves`)
        .send({ employeeId: e.id, type: 'ANNUAL', startDate: '2026-11-02', endDate: '2026-11-06' })
        .expect(201)).body as LeaveDto;
      expect(leave).toMatchObject({ status: 'PENDING', days: 5 });
      const clash = await manager
        .post(`${API}/hr/leaves`)
        .send({ employeeId: e.id, type: 'SICK', startDate: '2026-11-06', endDate: '2026-11-07' })
        .expect(409);
      expect(clash.body.code).toBe('LEAVE_OVERLAP');

      const approved = (await manager.post(`${API}/hr/leaves/${leave.id}/approve`).expect(200)).body as LeaveDto;
      expect(approved.status).toBe('APPROVED');
      expect(approved.decidedBy?.name).toContain('MANAGER');
      expect((await manager.post(`${API}/hr/leaves/${leave.id}/reject`).expect(409)).body.code).toBe('LEAVE_DECIDED');
      await manager.patch(`${API}/hr/leaves/${leave.id}`).send({ endDate: '2026-11-09' }).expect(409);

      // A rejected request does not block the dates.
      const other = (await manager
        .post(`${API}/hr/leaves`)
        .send({ employeeId: e.id, type: 'UNPAID', startDate: '2026-12-01', endDate: '2026-12-02' })
        .expect(201)).body as LeaveDto;
      await manager.post(`${API}/hr/leaves/${other.id}/reject`).expect(200);
      await manager.post(`${API}/hr/leaves`).send({ employeeId: e.id, type: 'ANNUAL', startDate: '2026-12-01', endDate: '2026-12-01' }).expect(201);
      await manager.post(`${API}/hr/leaves`).send({ employeeId: e.id, type: 'ANNUAL', startDate: '2026-12-05', endDate: '2026-12-04' }).expect(400);
    });
  });

  describe('payroll', () => {
    let ids: { full: string; midMonth: string };

    beforeAll(async () => {
      // Fresh riad state for payroll: deactivate everyone created above.
      await prisma.employee.updateMany({ where: { riadId: a.riadId }, data: { isActive: false } });
      ids = {
        full: (await employee({ firstName: 'Karima', baseSalary: 350000 })).id,
        midMonth: (await employee({ firstName: 'Omar', baseSalary: 280000, hireDate: '2026-10-15' })).id,
      };
      await employee({ firstName: 'Futur', hireDate: '2026-11-05' });
      const unpaid = (await manager
        .post(`${API}/hr/leaves`)
        .send({ employeeId: ids.midMonth, type: 'UNPAID', startDate: '2026-10-20', endDate: '2026-10-22' })
        .expect(201)).body as LeaveDto;
      await manager.post(`${API}/hr/leaves/${unpaid.id}/approve`).expect(200);
    });

    it('generates a draft once, from base salaries, for employees hired by month end', async () => {
      const first = (await manager.post(`${API}/hr/payroll/generate`).send({ month: '2026-10' }).expect(201)).body as PayrollMonthDto;
      expect(first.entries.map((e) => e.employee.name).sort()).toEqual(['Karima Zahra', 'Omar Zahra']);
      expect(first.totals).toMatchObject({ baseSalary: 630000, netPaid: 630000, paid: 0 });
      expect(first.missing).toBe(0);
      expect(first.entries.find((e) => e.employee.id === ids.midMonth)!.unpaidLeaveDays).toBe(3);
      const again = (await manager.post(`${API}/hr/payroll/generate`).send({ month: '2026-10' }).expect(201)).body as PayrollMonthDto;
      expect(again.entries).toHaveLength(2);
    });

    it('edits bonuses, advances and deductions, never below zero', async () => {
      const entry = await prisma.payrollEntry.findFirstOrThrow({ where: { employeeId: ids.full } });
      const res = await manager.patch(`${API}/hr/payroll/${entry.id}`).send({ bonuses: 50000, advances: 100000, deductions: 22000 }).expect(200);
      expect(res.body.netPaid).toBe(278000);
      expect((await manager.patch(`${API}/hr/payroll/${entry.id}`).send({ deductions: 999999 }).expect(400)).body.code).toBe('NEGATIVE_NET');
    });

    it('creates the Salaries expense when paid, locks both, and undoes it on cancel', async () => {
      const entry = await prisma.payrollEntry.findFirstOrThrow({ where: { employeeId: ids.full } });
      const paid = await manager.post(`${API}/hr/payroll/${entry.id}/pay`).send({ date: '2026-10-31', paymentMethod: 'TRANSFER' }).expect(200);
      expect(paid.body.paidAt).toBeTruthy();

      const expense = await prisma.expense.findUniqueOrThrow({ where: { payrollEntryId: entry.id } });
      expect(expense).toMatchObject({ categoryId: salariesId, amountTtc: 278000, tvaAmount: 0, paymentMethod: 'TRANSFER', note: 'Salaire 2026-10' });
      expect(expense.date.toISOString().slice(0, 10)).toBe('2026-10-31');

      // The expenses screens show the amount but not who it is for.
      const list = await manager.get(`${API}/expenses?from=2026-10-01&to=2026-10-31`).expect(200);
      expect(JSON.stringify(list.body)).not.toContain('Karima');
      expect(list.body.items[0].source).toBe('PAYROLL');
      expect((await manager.patch(`${API}/expenses/${expense.id}`).send({ amountTtc: 1 }).expect(409)).body.code).toBe('EXPENSE_LOCKED');
      expect((await manager.patch(`${API}/hr/payroll/${entry.id}`).send({ bonuses: 0 }).expect(409)).body.code).toBe('PAYROLL_PAID');
      expect((await manager.post(`${API}/hr/payroll/${entry.id}/pay`).send({}).expect(409)).body.code).toBe('PAYROLL_PAID');

      await manager.post(`${API}/hr/payroll/${entry.id}/unpay`).expect(200);
      expect(await prisma.expense.count({ where: { payrollEntryId: entry.id } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { entityId: entry.id, action: { in: ['payroll.pay', 'payroll.unpay'] } } })).toBe(2);
    });

    it('pays the whole month at once and exports it', async () => {
      const res = await manager.post(`${API}/hr/payroll/pay-month`).send({ month: '2026-10', date: '2026-10-31' }).expect(200);
      expect(res.body.paid).toBe(2);
      const month = (await manager.get(`${API}/hr/payroll?month=2026-10`).expect(200)).body as PayrollMonthDto;
      expect(month.totals.paid).toBe(month.totals.netPaid);
      expect(await prisma.expense.count({ where: { riadId: a.riadId, categoryId: salariesId } })).toBe(2);

      const xlsx = await manager.get(`${API}/hr/payroll/export?month=2026-10`).responseType('blob').expect(200);
      expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
      expect(xlsx.headers['content-disposition']).toContain('paie_2026-10.xlsx');
    });
  });
});
