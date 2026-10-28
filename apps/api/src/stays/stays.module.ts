import { Module } from '@nestjs/common';
import { StaysController, TodayController } from './stays.controller';
import { StaysService } from './stays.service';

@Module({
  controllers: [StaysController, TodayController],
  providers: [StaysService],
  exports: [StaysService],
})
export class StaysModule {}
