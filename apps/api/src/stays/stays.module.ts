import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { StaysController, TodayController } from './stays.controller';
import { StaysService } from './stays.service';

@Module({
  // Cancelling a paid stay can refund its payments (cash back out of the box).
  imports: [BillingModule],
  controllers: [StaysController, TodayController],
  providers: [StaysService],
  exports: [StaysService],
})
export class StaysModule {}
