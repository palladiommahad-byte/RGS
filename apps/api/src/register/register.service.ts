import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isoToUtcDate,
  nightsBetween,
  REGISTER_EXPORT_MAX_DAYS,
  TIMEZONE,
  todayIso,
  utcDateToIso,
  type DocumentType,
  type GuestRegisterRowDto,
  type Paginated,
  type Sex,
} from '@riad/shared';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { FieldEncryption } from '../common/crypto/field-encryption';
import { pageArgs, paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterExportQueryDto, RegisterQueryDto } from './register.dto';

const include = {
  stay: {
    select: { checkInDate: true, checkOutDate: true, checkedOutAt: true, status: true, room: { select: { name: true } } },
  },
} satisfies Prisma.GuestInclude;

type Row = Prisma.GuestGetPayload<{ include: typeof include }>;

const MAX_EXPORT_ROWS = 20_000;
const BOM = String.fromCharCode(0xfeff);

/** Police fiche columns, in the order the authorities expect them. */
const COLUMNS: { header: string; width: number; value: (r: GuestRegisterRowDto) => string }[] = [
  { header: 'Nom', width: 20, value: (r) => r.lastName },
  { header: 'Prénom', width: 20, value: (r) => r.firstName },
  { header: 'Sexe', width: 6, value: (r) => r.sex ?? '' },
  { header: 'Date de naissance', width: 16, value: (r) => frDate(r.birthDate) },
  { header: 'Nationalité', width: 12, value: (r) => r.nationality ?? '' },
  { header: 'Type de document', width: 18, value: (r) => DOC_LABEL[r.documentType ?? ''] ?? '' },
  { header: 'N° de document', width: 18, value: (r) => r.documentNumber ?? '' },
  { header: "Date d'arrivée", width: 14, value: (r) => frDate(r.checkInDate) },
  { header: 'Date de départ', width: 14, value: (r) => frDate(r.checkOutDate) },
  { header: 'Chambre', width: 14, value: (r) => r.room ?? '' },
];

const DOC_LABEL: Record<string, string> = { PASSPORT: 'Passeport', ID_CARD: "Carte d'identité", OTHER: 'Autre' };

function frDate(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
}

/** Spreadsheet formula injection guard + CSV quoting (semicolon: French Excel default). */
function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Guest register: everyone who actually stayed (checked in or out). Document numbers are
 * decrypted here, so every export is audit-logged.
 */
@Injectable()
export class RegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: FieldEncryption,
    private readonly audit: AuditService,
  ) {}

  async list(p: AuthPrincipal, q: RegisterQueryDto): Promise<Paginated<GuestRegisterRowDto>> {
    const where = this.where(p.riadId, q.from, q.to, q.search);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.guest.findMany({
        where,
        include,
        orderBy: [{ stay: { checkInDate: 'desc' } }, { stayId: 'asc' }, { isMain: 'desc' }, { lastName: 'asc' }],
        ...pageArgs(q),
      }),
      this.prisma.guest.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, q);
  }

  async export(
    p: AuthPrincipal,
    q: RegisterExportQueryDto,
  ): Promise<{ filename: string; contentType: string; body: Buffer }> {
    const days = nightsBetween(q.from, q.to);
    if (days < 1 || days > REGISTER_EXPORT_MAX_DAYS) {
      throw new AppException('INVALID_DATES', `Choose a period of 1 to ${REGISTER_EXPORT_MAX_DAYS} days`);
    }
    const rows = (
      await this.prisma.guest.findMany({
        where: this.where(p.riadId, q.from, q.to),
        include,
        orderBy: [{ stay: { checkInDate: 'asc' } }, { stayId: 'asc' }, { isMain: 'desc' }],
        take: MAX_EXPORT_ROWS,
      })
    ).map((r) => this.toDto(r));

    await this.audit.log({
      riadId: p.riadId,
      userId: p.userId,
      action: 'register.export',
      entity: 'Guest',
      diff: { from: q.from, to: q.to, format: q.format, rows: rows.length },
    });

    const filename = `registre-clients_${q.from}_${q.to}.${q.format}`;
    if (q.format === 'csv') {
      const lines = [COLUMNS.map((c) => c.header), ...rows.map((r) => COLUMNS.map((c) => c.value(r)))];
      const csv = lines.map((l) => l.map(csvCell).join(';')).join('\r\n');
      // BOM so Excel opens accented names correctly.
      return { filename, contentType: 'text/csv; charset=utf-8', body: Buffer.from(BOM + csv, 'utf8') };
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Riad Manager';
    const sheet = wb.addWorksheet('Registre', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E48' } };
    for (const r of rows) sheet.addRow(COLUMNS.map((c) => c.value(r)));
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
    const body = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body,
    };
  }

  private where(riadId: string, from?: string, to?: string, search?: string): Prisma.GuestWhereInput {
    const where: Prisma.GuestWhereInput = {
      riadId,
      stay: {
        status: { in: ['CHECKED_IN', 'CHECKED_OUT'] },
        ...(from ? { checkOutDate: { gt: isoToUtcDate(from) } } : {}),
        ...(to ? { checkInDate: { lt: isoToUtcDate(to) } } : {}),
      },
    };
    if (search) {
      const contains = { contains: search, mode: Prisma.QueryMode.insensitive };
      where.OR = [
        { firstName: contains },
        { lastName: contains },
        // Document numbers are encrypted: exact match through the blind index.
        { documentNumberHash: this.enc.hash(search) },
      ];
    }
    return where;
  }

  private toDto(r: Row): GuestRegisterRowDto {
    return {
      guestId: r.id,
      stayId: r.stayId,
      isMain: r.isMain,
      firstName: r.firstName,
      lastName: r.lastName,
      sex: r.sex as Sex | null,
      nationality: r.nationality,
      birthDate: r.birthDate ? utcDateToIso(r.birthDate) : null,
      documentType: r.documentType as DocumentType | null,
      documentNumber: r.documentNumber ? this.enc.decrypt(r.documentNumber) : null,
      checkInDate: utcDateToIso(r.stay.checkInDate),
      // The police fiche needs the real departure day, not the booked one.
      checkOutDate: r.stay.checkedOutAt ? todayIso(TIMEZONE, r.stay.checkedOutAt) : utcDateToIso(r.stay.checkOutDate),
      room: r.stay.room?.name ?? null,
      status: r.stay.status,
    };
  }
}
