import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { EmployeesService } from './employees.service';
import { HrController, StaffClockController } from './hr.controller';
import { LeavesService } from './leaves.service';
import { PayrollService } from './payroll.service';

@Module({
  controllers: [HrController, StaffClockController],
  providers: [EmployeesService, AttendanceService, LeavesService, PayrollService],
})
export class HrModule {}
