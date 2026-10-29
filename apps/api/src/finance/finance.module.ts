import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { TaxesController } from './taxes.controller';
import { TaxesService } from './taxes.service';

@Module({
  imports: [BillingModule],
  controllers: [FinanceController, TaxesController],
  providers: [FinanceService, TaxesService],
})
export class FinanceModule {}
