import { Module } from '@nestjs/common';
import { InvoicePdfService } from '../invoices/invoice-pdf.service';
import { InvoicesController } from '../invoices/invoices.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { TaxRatesService } from './tax-rates.service';

@Module({
  controllers: [BillingController, InvoicesController],
  providers: [BillingService, TaxRatesService, InvoicePdfService],
  exports: [TaxRatesService],
})
export class BillingModule {}
