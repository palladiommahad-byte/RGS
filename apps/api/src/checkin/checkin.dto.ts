import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PUBLIC_LOCALES, type PublicLocale } from '@riad/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsIsoDate, TrimToUndefined } from '../common/validation';
import { GuestInputDto } from '../stays/stays.dto';

/** The room whose QR code the guest scanned (every room has its own code). */
export class CheckinLinkDto {
  @ApiProperty({ description: 'Room QR token' })
  @IsString()
  @MaxLength(64)
  room: string;
}

export class CheckinGuestDto extends GuestInputDto {
  @ApiPropertyOptional({ description: 'Returned by scan-passport' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  photoRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mrzRaw?: string;
}

export class CheckinSubmitDto extends CheckinLinkDto {
  /** Honeypot: hidden from humans, filled by bots. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @ApiProperty({ enum: PUBLIC_LOCALES })
  @IsIn(PUBLIC_LOCALES)
  locale: PublicLocale;

  @ApiProperty({ example: '+33612345678', description: 'E.164' })
  @Matches(/^\+[1-9]\d{6,14}$/)
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimToUndefined()
  @IsEmail()
  email?: string;

  @ApiProperty() @IsInt() @Min(1) @Max(20) adults: number;
  @ApiProperty() @IsInt() @Min(0) @Max(20) children: number;
  @ApiProperty({ example: '2026-11-02' }) @IsIsoDate() checkOutDate: string;

  @ApiProperty()
  @IsBoolean()
  @Equals(true)
  consent: boolean;

  @ApiProperty({ description: 'PNG data URL from the signature pad' })
  @MaxLength(400_000)
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/)
  signature: string;

  @ApiProperty({ type: [CheckinGuestDto], description: 'Main guest first' })
  @ValidateNested({ each: true })
  @Type(() => CheckinGuestDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  guests: CheckinGuestDto[];
}
