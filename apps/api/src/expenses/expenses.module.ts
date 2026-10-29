import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { RecurringController } from './recurring.controller';
import { RecurringService } from './recurring.service';
import { SuppliersController } from './suppliers.controller';
import { WalletsController } from './wallets.controller';

@Module({
  controllers: [ExpensesController, SuppliersController, WalletsController, RecurringController],
  providers: [ExpensesService, RecurringService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
