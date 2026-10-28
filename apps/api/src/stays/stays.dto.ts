import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  DOCUMENT_TYPES,
  SEXES,
  STAY_SOURCES,
  STAY_STATUSES,
  type DocumentType,
  type Sex,
  type StaySource,
  type StayStatus,
} from '@riad/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import { IsIsoDate, TrimToUndefined } from '../common/validation';

export class GuestInputDto {
  @ApiProperty() @TrimToUndefined() @IsString() @Length(1, 80) firstName: string;
  @ApiProperty() @TrimToUndefined() @IsString() @Length(1, 80) lastName: string;

  @ApiPropertyOptional({ enum: SEXES }) @IsOptional() @IsIn(SEXES) sex?: Sex;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-3, e.g. FRA' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : undefined))
  @Matches(/^[A-Z]{3}$/)
  nationality?: string;

  @ApiPropertyOptional({ example: '1985-04-12' }) @IsOptional() @TrimToUndefined() @IsIsoDate() birthDate?: string;
  @ApiPropertyOptional({ enum: DOCUMENT_TYPES }) @IsOptional() @IsIn(DOCUMENT_TYPES) documentType?: DocumentType;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(40) documentNumber?: string;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsIsoDate() documentExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsEmail() email?: string;
}

export class UpdateGuestDto extends PartialType(GuestInputDto) {}

export class CreateStayDto {
  @ApiProperty({ enum: STAY_SOURCES }) @IsIn(STAY_SOURCES) source: StaySource;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(80) externalRef?: string;
  @ApiProperty({ example: '2026-05-01' }) @IsIsoDate() checkInDate: string;
  @ApiProperty({ example: '2026-05-03' }) @IsIsoDate() checkOutDate: string;
  @ApiProperty() @IsInt() @Min(1) @Max(20) adults: number;
  @ApiProperty() @IsInt() @Min(0) @Max(20) children: number;
  @ApiProperty({ description: 'Centimes' }) @IsInt() @Min(0) pricePerNight: number;
  @ApiPropertyOptional({ description: 'Centimes' }) @IsOptional() @IsInt() @Min(0) otaCommission?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() roomId?: string;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(2000) notes?: string;

  @ApiPropertyOptional({ description: 'Check the guest in immediately (needs roomId and checkin.confirm)' })
  @IsOptional()
  @IsBoolean()
  checkInNow?: boolean;

  @ApiProperty({ type: GuestInputDto })
  @ValidateNested()
  @Type(() => GuestInputDto)
  mainGuest: GuestInputDto;
}

export class UpdateStayDto extends PartialType(OmitType(CreateStayDto, ['mainGuest', 'checkInNow'] as const)) {}

export class ConfirmStayDto {
  @ApiProperty() @IsUUID() roomId: string;
  @ApiProperty({ enum: STAY_SOURCES }) @IsIn(STAY_SOURCES) source: StaySource;
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(80) externalRef?: string;
  @ApiProperty({ description: 'Centimes' }) @IsInt() @Min(0) pricePerNight: number;
  @ApiPropertyOptional({ description: 'Centimes' }) @IsOptional() @IsInt() @Min(0) otaCommission?: number;
}

export class ListStaysQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STAY_STATUSES }) @IsOptional() @IsIn(STAY_STATUSES) status?: StayStatus;

  @ApiPropertyOptional({ description: 'Guest name or external reference' })
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Stays overlapping [from, to)' }) @IsOptional() @IsIsoDate() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsIsoDate() to?: string;
}
