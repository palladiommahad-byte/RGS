import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS as P,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type ExpenseListDto,
} from '@riad/shared';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { CreateExpenseDto, ListExpensesQueryDto, UpdateExpenseDto } from './expenses.dto';
import { ExpensesService } from './expenses.service';

const ANY_EXPENSE = [P.EXPENSES_WRITE, P.EXPENSES_WRITE_PETTY_CASH, P.EXPENSES_READ_ALL] as const;
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

@ApiTags('expenses')
@Controller()
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @RequireAnyPermission(...ANY_EXPENSE)
  @Get('expense-categories')
  categories(@CurrentUser() p: AuthPrincipal): Promise<ExpenseCategoryDto[]> {
    return this.expenses.categories(p);
  }

  @RequireAnyPermission(...ANY_EXPENSE)
  @Get('expenses')
  list(@CurrentUser() p: AuthPrincipal, @Query() q: ListExpensesQueryDto): Promise<ExpenseListDto> {
    return this.expenses.list(p, q);
  }

  @RequirePermissions(P.EXPENSES_READ_ALL)
  @Get('expenses/creators')
  creators(@CurrentUser() p: AuthPrincipal) {
    return this.expenses.creators(p);
  }

  @RequireAnyPermission(P.EXPENSES_WRITE, P.EXPENSES_WRITE_PETTY_CASH)
  @Post('expenses')
  create(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateExpenseDto): Promise<ExpenseDto> {
    return this.expenses.create(p, dto);
  }

  @RequirePermissions(P.EXPENSES_WRITE)
  @Patch('expenses/:id')
  update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ): Promise<ExpenseDto> {
    return this.expenses.update(p, id, dto);
  }

  @RequirePermissions(P.EXPENSES_WRITE)
  @Delete('expenses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.expenses.remove(p, id);
  }

  @RequireAnyPermission(P.EXPENSES_WRITE, P.EXPENSES_WRITE_PETTY_CASH)
  @Post('expenses/:id/receipt')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } }))
  attachReceipt(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ExpenseDto> {
    return this.expenses.attachReceipt(p, id, file);
  }

  @RequireAnyPermission(...ANY_EXPENSE)
  @Get('expenses/:id/receipt')
  receipt(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<{ url: string }> {
    return this.expenses.receiptUrl(p, id);
  }
}
