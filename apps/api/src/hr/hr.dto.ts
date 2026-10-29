import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  CONTRACT_TYPES,
  EXPENSE_PAYMENT_METHODS,
  LEAVE_STATUSES,
  LEAVE_TYPES,
  type ContractType,
  type ExpensePaymentMethod,
  type LeaveStatus,
  type LeaveType,
} from '@riad/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import { IsIsoDate, QueryBoolean, TrimToUndefined } from '../common/validation';

/** Trims but keeps "", which means "clear this field" on update. */
const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Payroll is never paid from a petty-cash wallet. */
export const PAYROLL_METHODS = EXPENSE_PAYMENT_METHODS.filter((m) => m !== 'PETTY_CASH');

export class CreateEmployeeDto {
  @ApiProperty() @TrimToUndefined() @IsString() @Length(1, 80) firstName: string;
  @ApiProperty() @TrimToUndefined() @IsString() @Length(1, 80) lastName: string;
  @ApiPropertyOptional({ description: 'Empty string clears it' })
  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9]{0,20}$/)
  cin?: string;
  @ApiPropertyOptional({ description: 'Empty string clears it' }) @IsOptional() @Trim() @IsString() @MaxLength(20) cnssNumber?: string;
  @ApiPropertyOptional({ description: 'Empty string clears it' }) @IsOptional() @Trim() @IsString() @MaxLength(40) phone?: string;
  @ApiProperty() @TrimToUndefined() @IsString() @Length(1, 80) position: string;
  @ApiProperty({ enum: CONTRACT_TYPES }) @IsIn(CONTRACT_TYPES) contractType: ContractType;
  @ApiProperty() @IsIsoDate() hireDate: string;
  @ApiProperty({ description: 'Centimes per month' }) @IsInt() @Min(0) baseSalary: number;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListEmployeesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(80) search?: string;
  @ApiPropertyOptional() @IsOptional() @QueryBoolean() @IsBoolean() includeInactive?: boolean;
}

export class ClockDto {
  @ApiProperty({ description: 'Token read from the staff QR' }) @IsString() @Length(16, 128) token: string;
}

export class MonthQueryDto {
  @ApiProperty({ example: '2026-10' }) @Matches(MONTH) month: string;
}

export class AttendanceDto {
  @ApiProperty() @IsUUID() employeeId: string;
  @ApiProperty() @IsDateString() checkInAt: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() checkOutAt?: string | null;
}

export class UpdateAttendanceDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() checkInAt?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() checkOutAt?: string | null;
}

export class CreateLeaveDto {
  @ApiProperty() @IsUUID() employeeId: string;
  @ApiProperty({ enum: LEAVE_TYPES }) @IsIn(LEAVE_TYPES) type: LeaveType;
  @ApiProperty() @IsIsoDate() startDate: string;
  @ApiProperty() @IsIsoDate() endDate: string;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(300) note?: string;
}

export class UpdateLeaveDto extends PartialType(CreateLeaveDto) {}

export class ListLeavesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LEAVE_STATUSES }) @IsOptional() @IsIn(LEAVE_STATUSES) status?: LeaveStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
}

export class GeneratePayrollDto {
  @ApiProperty({ example: '2026-10' }) @Matches(MONTH) month: string;
}

export class UpdatePayrollDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) bonuses?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) advances?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) deductions?: number;
}

export class PayPayrollDto {
  @ApiPropertyOptional({ description: 'Defaults to today' }) @IsOptional() @IsIsoDate() date?: string;
  @ApiPropertyOptional({ enum: PAYROLL_METHODS }) @IsOptional() @IsIn(PAYROLL_METHODS) paymentMethod?: ExpensePaymentMethod;
}

export class PayMonthDto extends PayPayrollDto {
  @ApiProperty({ example: '2026-10' }) @Matches(MONTH) month: string;
}
