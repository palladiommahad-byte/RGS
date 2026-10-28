import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { REGISTER_EXPORT_FORMATS, type RegisterExportFormat } from '@riad/shared';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import { IsIsoDate, TrimToUndefined } from '../common/validation';

export class RegisterQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name, or an exact document number' })
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Stays overlapping [from, to)' }) @IsOptional() @IsIsoDate() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsIsoDate() to?: string;
}

export class RegisterExportQueryDto {
  @ApiProperty({ example: '2026-10-01' }) @IsIsoDate() from: string;
  @ApiProperty({ example: '2026-11-01' }) @IsIsoDate() to: string;
  @ApiProperty({ enum: REGISTER_EXPORT_FORMATS }) @IsIn(REGISTER_EXPORT_FORMATS) format: RegisterExportFormat;
}
