import { HttpStatus, Injectable } from '@nestjs/common';
import type { Employee, Prisma } from '@prisma/client';
import { isoToUtcDate, utcDateToIso, type EmployeeBadgeDto, type EmployeeDto, type Paginated } from '@riad/shared';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { FieldEncryption } from '../common/crypto/field-encryption';
import { diffFields } from '../common/diff';
import { pageArgs, paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from './hr.dto';

const CONTRACT_TYPES_ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const AUDITED = ['firstName', 'lastName', 'cnssNumber', 'phone', 'position', 'contractType', 'hireDate', 'baseSalary', 'isActive'] as const;

/** undefined = unchanged, "" = cleared. */
const clearable = (v: string | undefined) => (v === undefined ? undefined : v || null);

export const newClockToken = () => randomBytes(24).toString('base64url');
export const fullName = (e: Pick<Employee, 'firstName' | 'lastName'>) => `${e.firstName} ${e.lastName}`;

/** Employees (hr.* only). CIN is encrypted at rest with a blind index for exact search. */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly crypto: FieldEncryption,
  ) {}

  async list(p: AuthPrincipal, q: ListEmployeesQueryDto): Promise<Paginated<EmployeeDto>> {
    const where: Prisma.EmployeeWhereInput = { riadId: p.riadId };
    if (!q.includeInactive) where.isActive = true;
    if (q.search) {
      where.OR = [
        { firstName: { contains: q.search, mode: 'insensitive' } },
        { lastName: { contains: q.search, mode: 'insensitive' } },
        { position: { contains: q.search, mode: 'insensitive' } },
        { cinHash: this.crypto.hash(q.search) },
      ];
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }], ...pageArgs(q) }),
      this.prisma.employee.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r, false)), total, q);
  }

  async get(p: AuthPrincipal, id: string): Promise<EmployeeDto> {
    return this.toDto(await this.findOrThrow(p.riadId, id), true);
  }

  async create(p: AuthPrincipal, dto: CreateEmployeeDto): Promise<EmployeeDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          riadId: p.riadId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          ...this.cinFields(dto.cin),
          cnssNumber: dto.cnssNumber || null,
          phone: dto.phone || null,
          position: dto.position,
          contractType: dto.contractType,
          hireDate: isoToUtcDate(dto.hireDate),
          baseSalary: dto.baseSalary,
          clockToken: newClockToken(),
          createdBy: p.userId,
        },
      });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'employee.create',
          entity: 'Employee',
          entityId: created.id,
          diff: { name: fullName(created), position: dto.position, baseSalary: dto.baseSalary, cin: dto.cin ? '[set]' : null },
        },
        tx,
      );
      return created;
    });
    return this.toDto(row, true);
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateEmployeeDto): Promise<EmployeeDto> {
    const before = await this.findOrThrow(p.riadId, id);
    const data: Prisma.EmployeeUpdateInput = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      cnssNumber: clearable(dto.cnssNumber),
      phone: clearable(dto.phone),
      position: dto.position,
      contractType: dto.contractType,
      hireDate: dto.hireDate ? isoToUtcDate(dto.hireDate) : undefined,
      baseSalary: dto.baseSalary,
      isActive: dto.isActive,
    };
    // undefined = unchanged, "" = cleared.
    const cinChanged = dto.cin !== undefined;
    if (cinChanged) Object.assign(data, this.cinFields(dto.cin));
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({ where: { id }, data });
      const diff = { ...diffFields(before, updated, AUDITED), ...(cinChanged ? { cin: '[changed]' } : {}) };
      await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'employee.update', entity: 'Employee', entityId: id, diff }, tx);
      return updated;
    });
    return this.toDto(row, true);
  }

  /** Only employees without attendance or payroll history can be deleted; others are deactivated. */
  async remove(p: AuthPrincipal, id: string): Promise<void> {
    const e = await this.findOrThrow(p.riadId, id);
    const [attendance, payroll, leaves] = await Promise.all([
      this.prisma.attendance.count({ where: { employeeId: id } }),
      this.prisma.payrollEntry.count({ where: { employeeId: id } }),
      this.prisma.leave.count({ where: { employeeId: id } }),
    ]);
    if (attendance + payroll + leaves > 0) {
      throw new AppException('EMPLOYEE_HAS_HISTORY', 'This employee has history: deactivate instead', HttpStatus.CONFLICT);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.employee.delete({ where: { id } });
      await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'employee.delete', entity: 'Employee', entityId: id, diff: { name: fullName(e) } }, tx);
    });
    if (e.contractFileKey) await this.storage.delete('documents', [e.contractFileKey]);
  }

  async attachContract(p: AuthPrincipal, id: string, file: Express.Multer.File | undefined): Promise<EmployeeDto> {
    const e = await this.findOrThrow(p.riadId, id);
    if (!file || !CONTRACT_TYPES_ALLOWED.includes(file.mimetype)) {
      throw new AppException('UNSUPPORTED_FILE', 'Send a PDF or a photo (JPEG, PNG, WebP)');
    }
    let body = file.buffer;
    let ext = 'pdf';
    let contentType = 'application/pdf';
    if (file.mimetype !== 'application/pdf') {
      try {
        body = await sharp(file.buffer).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      } catch {
        throw new AppException('UNSUPPORTED_FILE', 'This image could not be read');
      }
      ext = 'jpg';
      contentType = 'image/jpeg';
    }
    const key = `riads/${p.riadId}/hr/contracts/${id}.${ext}`;
    await this.storage.put('documents', key, body, contentType);
    if (e.contractFileKey && e.contractFileKey !== key) await this.storage.delete('documents', [e.contractFileKey]);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({ where: { id }, data: { contractFileKey: key } });
      await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'employee.contract_upload', entity: 'Employee', entityId: id }, tx);
      return updated;
    });
    return this.toDto(row, true);
  }

  /** 5-minute signed link; every view is audit-logged. */
  async contractUrl(p: AuthPrincipal, id: string): Promise<{ url: string }> {
    const e = await this.findOrThrow(p.riadId, id);
    if (!e.contractFileKey) throw new AppException('NOT_FOUND', 'No contract', HttpStatus.NOT_FOUND);
    await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'employee.contract_view', entity: 'Employee', entityId: id });
    return { url: await this.storage.signedUrl('documents', e.contractFileKey) };
  }

  async badges(p: AuthPrincipal, id?: string): Promise<EmployeeBadgeDto[]> {
    const rows = await this.prisma.employee.findMany({
      where: { riadId: p.riadId, isActive: true, ...(id ? { id } : {}) },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map((e) => ({ id: e.id, name: fullName(e), position: e.position, token: e.clockToken }));
  }

  /** A lost badge: the old QR stops working at once. */
  async rotateBadge(p: AuthPrincipal, id: string): Promise<EmployeeBadgeDto> {
    await this.findOrThrow(p.riadId, id);
    const e = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({ where: { id }, data: { clockToken: newClockToken() } });
      await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'employee.badge_rotate', entity: 'Employee', entityId: id }, tx);
      return updated;
    });
    return { id: e.id, name: fullName(e), position: e.position, token: e.clockToken };
  }

  async findOrThrow(riadId: string, id: string): Promise<Employee> {
    const e = await this.prisma.employee.findFirst({ where: { id, riadId } });
    if (!e) throw new AppException('NOT_FOUND', 'Employee not found', HttpStatus.NOT_FOUND);
    return e;
  }

  private cinFields(cin: string | undefined): { cin: string | null; cinHash: string | null } {
    const v = cin?.toUpperCase();
    return v ? { cin: this.crypto.encrypt(v), cinHash: this.crypto.hash(v) } : { cin: null, cinHash: null };
  }

  private toDto(e: Employee, withCin: boolean): EmployeeDto {
    return {
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      cin: withCin && e.cin ? this.crypto.decrypt(e.cin) : null,
      cnssNumber: e.cnssNumber,
      phone: e.phone,
      position: e.position,
      contractType: e.contractType,
      hireDate: utcDateToIso(e.hireDate),
      baseSalary: e.baseSalary,
      isActive: e.isActive,
      hasContract: !!e.contractFileKey,
    };
  }
}
