import { Controller, Get, HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS as P } from '@riad/shared';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { InvoicePdfService } from './invoice-pdf.service';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdf: InvoicePdfService,
    private readonly audit: AuditService,
  ) {}

  /** 5-minute signed link to the PDF (rendered now if the checkout render failed). */
  @RequirePermissions(P.STAYS_READ)
  @Get(':id/pdf')
  async pdfUrl(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<{ url: string }> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, riadId: p.riadId } });
    if (!invoice) throw new AppException('NOT_FOUND', 'Invoice not found', HttpStatus.NOT_FOUND);
    const key = invoice.pdfKey ?? (await this.pdf.generate(invoice.id));
    await this.audit.log({
      riadId: p.riadId,
      userId: p.userId,
      action: 'invoice.download',
      entity: 'Invoice',
      entityId: invoice.id,
    });
    return { url: await this.storage.signedUrl('documents', key) };
  }
}
