import { ApiPropertyOptional } from '@nestjs/swagger';
import { ICE, INVOICE_PREFIX, TIME_OF_DAY } from '@riad/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { TrimToUndefined } from '../common/validation';

/** Trims but keeps "", which means "clear this field". */
const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const blank = (v: unknown) => v !== undefined && v !== '';

export class UpdateRiadSettingsDto {
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @Length(1, 120) name?: string;

  @ApiPropertyOptional({ description: 'Uppercase letters, digits and "-"' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(INVOICE_PREFIX)
  invoicePrefix?: string;

  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(200) address?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(80) city?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @ValidateIf((o: UpdateRiadSettingsDto) => blank(o.email)) @IsEmail() @MaxLength(120) email?: string;
  @ApiPropertyOptional({ description: 'ICE, 15 digits' }) @IsOptional() @Trim() @ValidateIf((o: UpdateRiadSettingsDto) => blank(o.ice)) @Matches(ICE) ice?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(20) fiscalId?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(30) rcNumber?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(20) patente?: string;
  @ApiPropertyOptional({ description: 'Shown to guests after check-in' }) @IsOptional() @Trim() @IsString() @MaxLength(300) wifiInfo?: string;
  @ApiPropertyOptional({ description: 'Automatic check-out, riad time HH:MM' }) @IsOptional() @Matches(TIME_OF_DAY) checkoutTime?: string;
  @ApiPropertyOptional({ description: 'Rooms to clean become free, riad time HH:MM' }) @IsOptional() @Matches(TIME_OF_DAY) roomReadyTime?: string;
}
