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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  PERMISSIONS as P,
  type AttendanceRecordDto,
  type AttendanceReportDto,
  type ClockResultDto,
  type EmployeeBadgeDto,
  type EmployeeDto,
  type LeaveDto,
  type Paginated,
  type PayrollEntryDto,
  type PayrollMonthDto,
} from '@riad/shared';
import type { Response } from 'express';
import { AuthenticatedOnly, CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { AttendanceService } from './attendance.service';
import { EmployeesService } from './employees.service';
import {
  AttendanceDto,
  ClockDto,
  CreateEmployeeDto,
  CreateLeaveDto,
  GeneratePayrollDto,
  ListEmployeesQueryDto,
  ListLeavesQueryDto,
  MonthQueryDto,
  PayMonthDto,
  PayPayrollDto,
  UpdateAttendanceDto,
  UpdateEmployeeDto,
  UpdateLeaveDto,
  UpdatePayrollDto,
} from './hr.dto';
import { LeavesService } from './leaves.service';
import { PayrollService } from './payroll.service';

const MAX_CONTRACT_BYTES = 10 * 1024 * 1024;

/** Staff badge scan on the reception tablet: any signed-in staff session, no HR data returned. */
@ApiTags('hr')
@Controller('staff')
export class StaffClockController {
  constructor(private readonly attendance: AttendanceService) {}

  @AuthenticatedOnly()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('clock')
  @HttpCode(HttpStatus.OK)
  clock(@CurrentUser() p: AuthPrincipal, @Body() dto: ClockDto): Promise<ClockResultDto> {
    return this.attendance.clock(p, dto.token);
  }
}

/** Everything else in HR: hr.read to see, hr.write to change. */
@ApiTags('hr')
@Controller('hr')
export class HrController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly attendance: AttendanceService,
    private readonly leaves: LeavesService,
    private readonly payroll: PayrollService,
  ) {}

  // ----- employees -----

  @RequirePermissions(P.HR_READ)
  @Get('employees')
  listEmployees(@CurrentUser() p: AuthPrincipal, @Query() q: ListEmployeesQueryDto): Promise<Paginated<EmployeeDto>> {
    return this.employees.list(p, q);
  }

  @RequirePermissions(P.HR_WRITE)
  @Get('employees/badges')
  badges(@CurrentUser() p: AuthPrincipal): Promise<EmployeeBadgeDto[]> {
    return this.employees.badges(p);
  }

  @RequirePermissions(P.HR_READ)
  @Get('employees/:id')
  getEmployee(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<EmployeeDto> {
    return this.employees.get(p, id);
  }

  @RequirePermissions(P.HR_WRITE)
  @Post('employees')
  createEmployee(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateEmployeeDto): Promise<EmployeeDto> {
    return this.employees.create(p, dto);
  }

  @RequirePermissions(P.HR_WRITE)
  @Patch('employees/:id')
  updateEmployee(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeDto> {
    return this.employees.update(p, id, dto);
  }

  @RequirePermissions(P.HR_WRITE)
  @Delete('employees/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeEmployee(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.employees.remove(p, id);
  }

  @RequirePermissions(P.HR_WRITE)
  @Post('employees/:id/contract')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CONTRACT_BYTES, files: 1 } }))
  attachContract(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<EmployeeDto> {
    return this.employees.attachContract(p, id, file);
  }

  @RequirePermissions(P.HR_READ)
  @Get('employees/:id/contract')
  contract(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<{ url: string }> {
    return this.employees.contractUrl(p, id);
  }

  @RequirePermissions(P.HR_WRITE)
  @Post('employees/:id/badge/rotate')
  rotateBadge(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<EmployeeBadgeDto> {
    return this.employees.rotateBadge(p, id);
  }

  // ----- attendance -----

  @RequirePermissions(P.HR_READ)
  @Get('attendance')
  attendanceReport(@CurrentUser() p: AuthPrincipal, @Query() q: MonthQueryDto): Promise<AttendanceReportDto> {
    return this.attendance.report(p, q.month);
  }

  @RequirePermissions(P.HR_WRITE)
  @Post('attendance')
  createAttendance(@CurrentUser() p: AuthPrincipal, @Body() dto: AttendanceDto): Promise<AttendanceRecordDto> {
    return this.attendance.create(p, dto);
  }

  @RequirePermissions(P.HR_WRITE)
  @Patch('attendance/:id')
  updateAttendance(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendanceDto,
  ): Promise<AttendanceRecordDto> {
    return this.attendance.update(p, id, dto);
  }

  @RequirePermissions(P.HR_WRITE)
  @Delete('attendance/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAttendance(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.attendance.remove(p, id);
  }

  // ----- leaves -----

  @RequirePermissions(P.HR_READ)
  @Get('leaves')
  listLeaves(@CurrentUser() p: AuthPrincipal, @Query() q: ListLeavesQueryDto): Promise<Paginated<LeaveDto>> {
    return this.leaves.list(p, q);
  }

  @RequirePermissions(P.HR_WRITE)
  @Post('leaves')
  createLeave(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateLeaveDto): Promise<LeaveDto> {
    return this.leaves.create(p, dto);
  }

  @RequirePermissions(P.HR_WRITE)
  @Patch('leaves/:id')
  updateLeave(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeaveDto): Promise<LeaveDto> {
    return this.leaves.update(p, id, dto);
  }

  @RequirePermissions(P.HR_WRITE)
  @Post('leaves/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveLeave(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<LeaveDto> {
    return this.leaves.decide(p, id, 'APPROVED');
  }

  @RequirePermissions(P.HR_WRITE)
  @Post('leaves/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectLeave(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<LeaveDto> {
    return this.leaves.decide(p, id, 'REJECTED');
  }

  @RequirePermissions(P.HR_WRITE)
  @Delete('leaves/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeLeave(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.leaves.remove(p, id);
  }

  // ----- payroll -----

  @RequirePermissions(P.HR_READ)
  @Get('payroll')
  payrollMonth(@CurrentUser() p: AuthPrincipal, @Query() q: MonthQueryDto): Promise<PayrollMonthDto> {
    return this.payroll.month(p, q.month);
  }

  @RequirePermissions(P.HR_READ)
  @Get('payroll/export')
  async payrollExport(
    @CurrentUser() p: AuthPrincipal,
    @Query() q: MonthQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const body = await this.payroll.xlsx(p, q.month);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="paie_${q.month}.xlsx"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(body);
  }

  @RequirePermissions(P.HR_WRITE)
  @Post('payroll/generate')
  generatePayroll(@CurrentUser() p: AuthPrincipal, @Body() dto: GeneratePayrollDto): Promise<PayrollMonthDto> {
    return this.payroll.generate(p, dto.month);
  }

  @RequirePermissions(P.HR_WRITE)
  @Post('payroll/pay-month')
  @HttpCode(HttpStatus.OK)
  payMonth(@CurrentUser() p: AuthPrincipal, @Body() dto: PayMonthDto): Promise<{ paid: number }> {
    return this.payroll.payMonth(p, dto.month, dto);
  }

  @RequirePermissions(P.HR_WRITE)
  @Patch('payroll/:id')
  updatePayroll(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollDto,
  ): Promise<PayrollEntryDto> {
    return this.payroll.update(p, id, dto);
  }

  @RequirePermissions(P.HR_WRITE)
  @Post('payroll/:id/pay')
  @HttpCode(HttpStatus.OK)
  pay(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPayrollDto): Promise<PayrollEntryDto> {
    return this.payroll.pay(p, id, dto);
  }

  @RequirePermissions(P.HR_WRITE)
  @Post('payroll/:id/unpay')
  @HttpCode(HttpStatus.OK)
  unpay(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<PayrollEntryDto> {
    return this.payroll.unpay(p, id);
  }

  @RequirePermissions(P.HR_WRITE)
  @Delete('payroll/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePayroll(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.payroll.remove(p, id);
  }
}
