import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS as P, type BackupStatusDto } from '@riad/shared';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { RestoreBackupDto } from './backups.dto';
import { BackupsService } from './backups.service';

/** Backup history, "Back up now" and restore: riad settings; restoring is for owners only. */
@ApiTags('backups')
@RequirePermissions(P.SETTINGS_RIAD)
@Controller('backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  status(@CurrentUser() p: AuthPrincipal): Promise<BackupStatusDto> {
    return this.backups.status(p);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  request(@CurrentUser() p: AuthPrincipal): Promise<void> {
    return this.backups.request(p);
  }

  /** Replaces every record and file with backup `name` (a safety copy is made first). */
  @Post('restore')
  @HttpCode(HttpStatus.ACCEPTED)
  restore(@CurrentUser() p: AuthPrincipal, @Body() dto: RestoreBackupDto): Promise<void> {
    return this.backups.restore(p, dto.name, dto.confirm);
  }
}
