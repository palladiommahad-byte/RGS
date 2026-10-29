import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { EXPENSE_PAYMENT_METHODS, type ExpensePaymentMethod } from '@riad/shared';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, NotEquals } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import { IsIsoDate, QueryBoolean, TrimToUndefined } from '../common/validation';

/** Recurring and non-wallet expenses cannot use PETTY_CASH (that needs a wallet). */
const NON_WALLET_METHODS = EXPENSE_PAYMENT_METHODS.filter((m) => m !== 'PETTY_CASH');

export class CreateExpenseDto {
  @ApiProperty({ description: 'Centimes, TTC' }) @IsInt() @Min(1) amountTtc: number;
  @ApiPropertyOptional({ description: 'Deductible TVA, centimes' }) @IsOptional() @IsInt() @Min(0) tvaAmount?: number;
  @ApiProperty() @IsUUID() categoryId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() supplierId?: string;

  @ApiPropertyOptional({ description: 'Existing or new supplier (created on the fly)' })
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(120)
  supplierName?: string;

  @ApiPropertyOptional({ description: 'Defaults to today' }) @IsOptional() @IsIsoDate() date?: string;
  @ApiPropertyOptional({ enum: EXPENSE_PAYMENT_METHODS }) @IsOptional() @IsIn(EXPENSE_PAYMENT_METHODS) paymentMethod?: ExpensePaymentMethod;
  @ApiPropertyOptional({ description: 'Petty-cash wallet (PETTY_CASH)' }) @IsOptional() @IsUUID() walletId?: string;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(500) note?: string;
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

export class ListExpensesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsIsoDate() from?: string;
  @ApiPropertyOptional({ description: 'Inclusive' }) @IsOptional() @IsIsoDate() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() supplierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() createdBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() walletId?: string;
}

export class SupplierDto {
  @ApiProperty() @TrimToUndefined() @IsString() @Length(1, 120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() defaultCategoryId?: string;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(40) phone?: string;
}

export class UpdateSupplierDto extends PartialType(SupplierDto) {}

export class ListSuppliersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(120) search?: string;
}

export class CreateWalletDto {
  @ApiProperty() @IsUUID() holderId: string;
  @ApiProperty() @TrimToUndefined() @IsString() @Length(1, 80) name: string;
}

export class UpdateWalletDto {
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @Length(1, 80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class TopUpDto {
  @ApiProperty({ description: 'Centimes' }) @IsInt() @Min(1) amount: number;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(200) note?: string;
}

export class AdjustWalletDto {
  @ApiProperty({ description: 'Signed centimes (counted cash minus balance)' })
  @IsInt()
  @NotEquals(0)
  amount: number;

  @ApiProperty() @TrimToUndefined() @IsString() @Length(1, 200) note: string;
}

export class CreateRecurringDto {
  @ApiProperty() @TrimToUndefined() @IsString() @Length(1, 120) label: string;
  @ApiProperty() @IsUUID() categoryId: string;
  @ApiProperty({ description: 'Centimes' }) @IsInt() @Min(1) amount: number;
  @ApiProperty({ minimum: 1, maximum: 31 }) @Type(() => Number) @IsInt() @Min(1) @Max(31) dayOfMonth: number;
  @ApiPropertyOptional({ enum: NON_WALLET_METHODS }) @IsOptional() @IsIn(NON_WALLET_METHODS) paymentMethod?: ExpensePaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsUUID() supplierId?: string;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(120) supplierName?: string;
}

export class UpdateRecurringDto extends PartialType(CreateRecurringDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListRecurringQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @QueryBoolean() @IsBoolean() includeInactive?: boolean;
}
