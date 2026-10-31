import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EXTRA_CATEGORIES,
  PAYMENT_METHODS,
  type ExtraCategory,
  type PaymentMethod,
} from '@riad/shared';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { TrimToUndefined } from '../common/validation';

export class CreateExtraDto {
  @ApiProperty({ example: 'Dîner marocain' })
  @TrimToUndefined()
  @IsString()
  @Length(1, 120)
  label: string;

  @ApiProperty({ enum: EXTRA_CATEGORIES }) @IsIn(EXTRA_CATEGORIES) category: ExtraCategory;
  @ApiProperty() @IsInt() @Min(1) @Max(999) quantity: number;
  @ApiProperty({ description: 'Centimes, TTC' }) @IsInt() @Min(0) unitPrice: number;
}

export class CreatePaymentDto {
  @ApiProperty({ description: 'Centimes' }) @IsInt() @Min(1) amount: number;
  @ApiProperty({ enum: PAYMENT_METHODS }) @IsIn(PAYMENT_METHODS) method: PaymentMethod;

  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @IsISO8601()
  paidAt?: string;

  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(200) note?: string;

  @ApiPropertyOptional({ description: 'Cash only: the cash box it goes into (default: yours, or the only one)' })
  @IsOptional()
  @IsUUID()
  walletId?: string;
}

export class CheckoutDto {
  /** Check out even though the guest still owes money (company billing, pays later). */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acceptBalanceDue?: boolean;
}
