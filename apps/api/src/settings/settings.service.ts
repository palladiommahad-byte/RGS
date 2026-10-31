import { HttpStatus, Injectable } from '@nestjs/common';
import type { Riad } from '@prisma/client';
import { formatInvoiceNumber, todayIso, type RiadSettingsDto } from '@riad/shared';
import sharp from 'sharp';
import { AuditService } from '../audit/audit.service';
import { logoVersion } from '../auth/auth.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { diffFields } from '../common/diff';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { UpdateRiadSettingsDto } from './settings.dto';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const FIELDS = ['name', 'address', 'city', 'phone', 'email', 'invoicePrefix', 'ice', 'fiscalId', 'rcNumber', 'patente', 'wifiInfo', 'checkoutTime', 'roomReadyTime'] as const;

/** undefined = unchanged, "" = cleared. */
const clearable = (v: string | undefined) => (v === undefined ? undefined : v || null);

/** The riad's own profile: identity on invoices, invoice prefix, Wi-Fi shown to guests, logo. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async get(riadId: string): Promise<RiadSettingsDto> {
    return this.toDto(await this.prisma.riad.findUniqueOrThrow({ where: { id: riadId } }));
  }

  async update(p: AuthPrincipal, dto: UpdateRiadSettingsDto): Promise<RiadSettingsDto> {
    const before = await this.prisma.riad.findUniqueOrThrow({ where: { id: p.riadId } });
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.riad.update({
        where: { id: p.riadId },
        data: {
          name: dto.name,
          invoicePrefix: dto.invoicePrefix,
          address: clearable(dto.address),
          city: dto.city === undefined ? undefined : dto.city || 'Marrakech',
          phone: clearable(dto.phone),
          email: clearable(dto.email),
          ice: clearable(dto.ice),
          fiscalId: clearable(dto.fiscalId),
          rcNumber: clearable(dto.rcNumber),
          patente: clearable(dto.patente),
          wifiInfo: clearable(dto.wifiInfo),
          checkoutTime: dto.checkoutTime,
          roomReadyTime: dto.roomReadyTime,
        },
      });
      await this.audit.log(
        { riadId: p.riadId, userId: p.userId, action: 'riad.update', entity: 'Riad', entityId: p.riadId, diff: diffFields(before, updated, FIELDS) },
        tx,
      );
      return updated;
    });
    return this.toDto(row);
  }

  /** Re-encoded as a ≤512 px PNG (strips metadata; SVG is refused). */
  async setLogo(p: AuthPrincipal, file: Express.Multer.File | undefined): Promise<RiadSettingsDto> {
    if (!file || !LOGO_TYPES.includes(file.mimetype)) {
      throw new AppException('UNSUPPORTED_FILE', 'Send a PNG, JPEG or WebP image');
    }
    let png: Buffer;
    try {
      png = await sharp(file.buffer).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    } catch {
      throw new AppException('UNSUPPORTED_FILE', 'This image could not be read');
    }
    const before = await this.prisma.riad.findUniqueOrThrow({ where: { id: p.riadId } });
    const key = `riads/${p.riadId}/branding/logo-${Date.now()}.png`;
    await this.storage.put('documents', key, png, 'image/png');
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.riad.update({ where: { id: p.riadId }, data: { logoKey: key } });
      await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'riad.logo_upload', entity: 'Riad', entityId: p.riadId }, tx);
      return updated;
    });
    await this.storage.delete('documents', [before.logoKey]);
    return this.toDto(row);
  }

  async removeLogo(p: AuthPrincipal): Promise<RiadSettingsDto> {
    const before = await this.prisma.riad.findUniqueOrThrow({ where: { id: p.riadId } });
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.riad.update({ where: { id: p.riadId }, data: { logoKey: null } });
      await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'riad.logo_remove', entity: 'Riad', entityId: p.riadId }, tx);
      return updated;
    });
    await this.storage.delete('documents', [before.logoKey]);
    return this.toDto(row);
  }

  /** Logo bytes for the staff UI (served through the API: the bucket stays private). */
  async logo(riadId: string): Promise<Buffer> {
    const riad = await this.prisma.riad.findUniqueOrThrow({ where: { id: riadId }, select: { logoKey: true } });
    if (!riad.logoKey) throw new AppException('NOT_FOUND', 'No logo', HttpStatus.NOT_FOUND);
    return this.storage.get('documents', riad.logoKey);
  }

  private async toDto(r: Riad): Promise<RiadSettingsDto> {
    const year = Number(todayIso().slice(0, 4));
    const seq = await this.prisma.invoiceSequence.findUnique({ where: { riadId_year: { riadId: r.id, year } } });
    return {
      id: r.id,
      name: r.name,
      address: r.address,
      city: r.city,
      phone: r.phone,
      email: r.email,
      invoicePrefix: r.invoicePrefix,
      ice: r.ice,
      fiscalId: r.fiscalId,
      rcNumber: r.rcNumber,
      patente: r.patente,
      wifiInfo: r.wifiInfo,
      checkoutTime: r.checkoutTime,
      roomReadyTime: r.roomReadyTime,
      logoVersion: logoVersion(r.logoKey),
      nextInvoiceNumber: formatInvoiceNumber(r.invoicePrefix, year, (seq?.lastValue ?? 0) + 1),
    };
  }
}
