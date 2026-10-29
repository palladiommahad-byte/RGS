import type { Prisma, PrismaClient } from '@prisma/client';
import { addDays, addMonths, isoToUtcDate, nightsBetween, payrollNet, zonedMidnight } from '@riad/shared';
import type { FieldEncryption } from '../src/common/crypto/field-encryption';
import { newClockToken } from '../src/hr/employees.service';
import { payrollExpenseData } from '../src/hr/payroll-expense';

// Own deterministic PRNG (mulberry32) so the stays/expenses sequence is unaffected.
let seed = 7_2026;
function rand(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
/** Riad-local wall-clock time, from the runtime's tz data. */
const at = (iso: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(zonedMidnight(iso).getTime() + (h! * 60 + m!) * 60_000);
};

const STAFF = [
  { first: 'Fatima', last: 'Benali', cin: 'EE482913', position: 'Cuisinière', salary: 420000, restDay: 1, contract: 'CDI' },
  { first: 'Youssef', last: 'El Amrani', cin: 'EB219034', position: 'Réceptionniste', salary: 450000, restDay: 2, contract: 'CDI' },
  { first: 'Khadija', last: 'Ait Lahcen', cin: 'EE903127', position: 'Femme de chambre', salary: 320000, restDay: 0, contract: 'CDI' },
  { first: 'Hamid', last: 'Ouali', cin: 'E716520', position: "Homme d'entretien", salary: 350000, restDay: 5, contract: 'CDD' },
] as const;

/**
 * Four employees with ~3 months of badge scans, a few leaves and paid payroll (which creates
 * the Salaries expenses). Runs only when the riad has no attendance yet, so real HR data is
 * never touched.
 */
export async function seedHrDemo(
  prisma: PrismaClient,
  enc: FieldEncryption,
  riadId: string,
  start: string,
  today: string,
  salariesId: string,
): Promise<string> {
  if ((await prisma.attendance.count({ where: { riadId } })) > 0) return 'HR demo: skipped (attendance already present)';
  const manager = await prisma.user.findFirst({ where: { riadId, role: { key: 'MANAGER' } } });

  const employees = [];
  for (const s of STAFF) {
    const existing = await prisma.employee.findFirst({ where: { riadId, firstName: s.first, lastName: s.last } });
    employees.push(
      existing ??
        (await prisma.employee.create({
          data: {
            riadId,
            firstName: s.first,
            lastName: s.last,
            cin: enc.encrypt(s.cin),
            cinHash: enc.hash(s.cin),
            cnssNumber: String(int(100_000_000, 199_999_999)),
            phone: `06${int(10_000_000, 99_999_999)}`,
            position: s.position,
            contractType: s.contract,
            hireDate: isoToUtcDate('2026-06-01'),
            baseSalary: s.salary,
            clockToken: newClockToken(),
          },
        })),
    );
  }
  const [fatima, youssef, , hamid] = employees as [(typeof employees)[number], (typeof employees)[number], unknown, (typeof employees)[number]];

  // Leaves: a past annual leave, unpaid days this month, a request waiting for a decision.
  const thisMonth = today.slice(0, 7);
  const lastMonth = addMonths(today, -1).slice(0, 7);
  const leaves = [
    { employeeId: fatima.id, type: 'ANNUAL', start: `${lastMonth}-10`, end: `${lastMonth}-14`, approved: true },
    { employeeId: hamid.id, type: 'UNPAID', start: `${thisMonth}-06`, end: `${thisMonth}-07`, approved: true },
    { employeeId: youssef.id, type: 'ANNUAL', start: addDays(today, 12), end: addDays(today, 18), approved: false },
  ] as const;
  for (const l of leaves) {
    await prisma.leave.create({
      data: {
        riadId,
        employeeId: l.employeeId,
        type: l.type,
        startDate: isoToUtcDate(l.start),
        endDate: isoToUtcDate(l.end),
        status: l.approved ? 'APPROVED' : 'PENDING',
        decidedBy: l.approved ? manager?.id : null,
        decidedAt: l.approved ? new Date() : null,
      },
    });
  }
  const onLeave = (employeeId: string, d: string) =>
    leaves.some((l) => l.approved && l.employeeId === employeeId && l.start <= d && d <= l.end);

  // Badge scans around 08:00 → 16:30, one weekly rest day each, a few forgotten check-outs;
  // today everyone is still on shift.
  const scans: Prisma.AttendanceCreateManyInput[] = [];
  for (let i = 0; i <= nightsBetween(start, today); i++) {
    const d = addDays(start, i);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    employees.forEach((e, k) => {
      if (dow === STAFF[k]!.restDay || onLeave(e.id, d)) return;
      const checkInAt = new Date(at(d, '08:00').getTime() + int(-15, 20) * 60_000);
      const checkOutAt = new Date(at(d, '16:30').getTime() + int(-20, 40) * 60_000);
      const open = d === today || rand() < 0.02;
      scans.push({ riadId, employeeId: e.id, checkInAt, checkOutAt: open ? null : checkOutAt });
    });
  }
  await prisma.attendance.createMany({ data: scans });

  // Payroll paid on the 28th of every month whose 28th is inside the window.
  let paid = 0;
  for (let month = start.slice(0, 7); month <= thisMonth; month = addMonths(`${month}-01`, 1).slice(0, 7)) {
    const payDay = `${month}-28`;
    if (payDay < start || payDay > today) continue;
    for (const e of employees) {
      const amounts = {
        baseSalary: e.baseSalary,
        bonuses: e.id === fatima.id && month === lastMonth ? 30_000 : 0,
        advances: e.id === youssef.id && month === thisMonth ? 100_000 : 0,
        // Two unpaid days at base / 26 — entered by hand, as the manager would.
        deductions: e.id === hamid.id && month === thisMonth ? Math.round((e.baseSalary * 2) / 26) : 0,
      };
      const entry = await prisma.payrollEntry.create({
        data: { riadId, employeeId: e.id, month: isoToUtcDate(`${month}-01`), ...amounts, netPaid: payrollNet(amounts), paidAt: at(payDay, '10:00') },
      });
      const expense = payrollExpenseData(entry, salariesId, payDay, 'TRANSFER', manager?.id ?? '');
      if (expense) await prisma.expense.create({ data: { ...expense, createdBy: manager?.id ?? null } });
      paid++;
    }
  }
  return `HR demo: ${employees.length} employees, ${scans.length} badge scans, ${leaves.length} leaves, ${paid} paid payroll lines`;
}
