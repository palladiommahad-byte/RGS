import { z } from 'zod';
import { isIsoDate, type IsoDate } from '../dates';
import { CONTRACT_TYPES, LEAVE_TYPES, type ContractType, type LeaveStatus, type LeaveType } from '../hr';

const madAmount = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d{1,2})?$/, 'invalid_amount');
const optionalMad = madAmount.optional().or(z.literal('').transform(() => undefined));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const isoDate = z.string().refine(isIsoDate, 'invalid_date');

export const employeeFormSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  cin: optionalText(20).refine((v) => !v || /^[A-Za-z0-9]+$/.test(v), 'invalid_cin'),
  cnssNumber: optionalText(20),
  phone: optionalText(40),
  position: z.string().trim().min(1).max(80),
  contractType: z.enum(CONTRACT_TYPES),
  hireDate: isoDate,
  baseSalaryMad: madAmount,
});
export type EmployeeFormInput = z.infer<typeof employeeFormSchema>;

export const leaveFormSchema = z
  .object({
    employeeId: z.string().uuid('required'),
    type: z.enum(LEAVE_TYPES),
    startDate: isoDate,
    endDate: isoDate,
    note: optionalText(300),
  })
  .refine((v) => !isIsoDate(v.startDate) || !isIsoDate(v.endDate) || v.endDate >= v.startDate, {
    message: 'end_before_start',
    path: ['endDate'],
  });

export const payrollEditSchema = z.object({
  bonusesMad: optionalMad,
  advancesMad: optionalMad,
  deductionsMad: optionalMad,
});

/** Manual attendance correction; times are `datetime-local` values in the riad's timezone. */
export const attendanceFormSchema = z
  .object({
    employeeId: z.string().uuid('required'),
    checkInAt: z.string().min(1, 'required'),
    checkOutAt: optionalText(30),
  })
  .refine((v) => !v.checkOutAt || v.checkOutAt > v.checkInAt, { message: 'end_before_start', path: ['checkOutAt'] });

type Ref = { id: string; name: string };

export type EmployeeDto = {
  id: string;
  firstName: string;
  lastName: string;
  /** Decrypted; only in the single-employee endpoint (null in lists). */
  cin: string | null;
  cnssNumber: string | null;
  phone: string | null;
  position: string;
  contractType: ContractType;
  hireDate: IsoDate;
  baseSalary: number;
  isActive: boolean;
  hasContract: boolean;
};

export type EmployeeBadgeDto = { id: string; name: string; position: string; token: string };

/** What the reception tablet shows after a scan: first name only, no HR data. */
export type ClockResultDto = {
  action: 'IN' | 'OUT' | 'DUPLICATE';
  firstName: string;
  at: string;
  /** Length of the shift just closed (OUT). */
  minutes: number | null;
};

export type AttendanceRecordDto = {
  id: string;
  employeeId: string;
  date: IsoDate;
  checkInAt: string;
  checkOutAt: string | null;
  minutes: number | null;
};

export type AttendanceReportDto = {
  month: string;
  employees: {
    employee: Ref & { position: string };
    daysWorked: number;
    minutes: number;
    openShifts: number;
    leaveDays: number;
    records: AttendanceRecordDto[];
  }[];
};

export type LeaveDto = {
  id: string;
  employee: Ref;
  type: LeaveType;
  startDate: IsoDate;
  endDate: IsoDate;
  days: number;
  status: LeaveStatus;
  note: string | null;
  decidedBy: Ref | null;
  decidedAt: string | null;
};

export type PayrollEntryDto = {
  id: string;
  employee: Ref & { position: string };
  month: string;
  baseSalary: number;
  bonuses: number;
  advances: number;
  deductions: number;
  netPaid: number;
  paidAt: string | null;
  /** Approved unpaid-leave days in the month, shown as a hint for deductions. */
  unpaidLeaveDays: number;
};

export type PayrollMonthDto = {
  month: string;
  entries: PayrollEntryDto[];
  totals: { baseSalary: number; bonuses: number; advances: number; deductions: number; netPaid: number; paid: number };
  /** Active employees with no entry for the month yet. */
  missing: number;
};
