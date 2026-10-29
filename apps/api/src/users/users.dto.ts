import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_MIN } from '@riad/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import { QueryBoolean, TrimToUndefined } from '../common/validation';

const Email = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export class CreateUserDto {
  @ApiProperty() @TrimToUndefined() @IsString() @Length(1, 80) name: string;
  @ApiProperty() @Email() @IsEmail() @MaxLength(120) email: string;
  @ApiProperty() @IsUUID() roleId: string;
  @ApiProperty({ minLength: PASSWORD_MIN, description: 'Temporary password, to be changed by the user' })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(128)
  password: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @Length(1, 80) name?: string;
  @ApiPropertyOptional() @IsOptional() @Email() @IsEmail() @MaxLength(120) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() roleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: PASSWORD_MIN }) @IsString() @MinLength(PASSWORD_MIN) @MaxLength(128) password: string;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @TrimToUndefined() @IsString() @MaxLength(80) search?: string;
  @ApiPropertyOptional() @IsOptional() @QueryBoolean() @IsBoolean() includeInactive?: boolean;
}
