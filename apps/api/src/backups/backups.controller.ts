import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS as P, type BackupStatusDto } from '@riad/shared';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { BackupsService } from './backups.service';

/** Backup history and "Back up now": the owner (riad settings) only. */
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
}
