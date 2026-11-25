import { ApiProperty } from '@nestjs/swagger';
import { BACKUP_NAME, RESTORE_CONFIRM_WORD } from '@riad/shared';
import { IsString, Matches, MaxLength } from 'class-validator';

export class RestoreBackupDto {
  @ApiProperty({ example: '2026-10-31_030000', description: 'Stamp of a good backup' })
  @IsString()
  @Matches(BACKUP_NAME)
  name!: string;

  @ApiProperty({ example: RESTORE_CONFIRM_WORD, description: `Must be exactly "${RESTORE_CONFIRM_WORD}"` })
  @IsString()
  @MaxLength(20)
  confirm!: string;
}
