import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS as P, type Paginated, type RecurringExpenseDto } from '@riad/shared';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { CreateRecurringDto, ListRecurringQueryDto, UpdateRecurringDto } from './expenses.dto';
import { RecurringService } from './recurring.service';

@ApiTags('expenses')
@RequirePermissions(P.EXPENSES_WRITE)
@Controller('recurring-expenses')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  list(@CurrentUser() p: AuthPrincipal, @Query() q: ListRecurringQueryDto): Promise<Paginated<RecurringExpenseDto>> {
    return this.recurring.list(p, q);
  }

  @Post()
  create(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateRecurringDto): Promise<RecurringExpenseDto> {
    return this.recurring.create(p, dto);
  }

  /** Runs today's generation now instead of waiting for the night job. */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  async run(@CurrentUser() p: AuthPrincipal): Promise<{ created: number }> {
    return { created: await this.recurring.generateDue(p.riadId) };
  }

  @Patch(':id')
  update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringDto,
  ): Promise<RecurringExpenseDto> {
    return this.recurring.update(p, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurring.remove(p, id);
  }
}
