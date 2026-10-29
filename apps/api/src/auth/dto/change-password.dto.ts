import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_MIN } from '@riad/shared';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) current: string;
  @ApiProperty({ minLength: PASSWORD_MIN }) @IsString() @MinLength(PASSWORD_MIN) @MaxLength(128) next: string;
}
