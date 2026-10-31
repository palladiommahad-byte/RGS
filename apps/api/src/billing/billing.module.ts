import { Module } from '@nestjs/common';
import { InvoicePdfService } from '../invoices/invoice-pdf.service';
import { InvoicesController } from '../invoices/invoices.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaymentsController } from './payments.controller';
import { StayCycleService } from './stay-cycle.service';
import { TaxRatesService } from './tax-rates.service';

@Module({
  controllers: [BillingController, InvoicesController, PaymentsController],
  providers: [BillingService, TaxRatesService, InvoicePdfService, StayCycleService],
  exports: [TaxRatesService],
})
export class BillingModule {}
