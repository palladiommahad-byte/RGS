import { Body, Controller, Delete, Get, Patch, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS as P, type RiadSettingsDto } from '@riad/shared';
import type { Response } from 'express';
import { AuthenticatedOnly, CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { UpdateRiadSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

const MAX_LOGO_BYTES = 4 * 1024 * 1024;

@ApiTags('settings')
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @RequirePermissions(P.SETTINGS_RIAD)
  @Get('settings/riad')
  get(@CurrentUser() p: AuthPrincipal): Promise<RiadSettingsDto> {
    return this.settings.get(p.riadId);
  }

  @RequirePermissions(P.SETTINGS_RIAD)
  @Patch('settings/riad')
  update(@CurrentUser() p: AuthPrincipal, @Body() dto: UpdateRiadSettingsDto): Promise<RiadSettingsDto> {
    return this.settings.update(p, dto);
  }

  @RequirePermissions(P.SETTINGS_RIAD)
  @Post('settings/riad/logo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LOGO_BYTES, files: 1 } }))
  setLogo(@CurrentUser() p: AuthPrincipal, @UploadedFile() file: Express.Multer.File | undefined): Promise<RiadSettingsDto> {
    return this.settings.setLogo(p, file);
  }

  @RequirePermissions(P.SETTINGS_RIAD)
  @Delete('settings/riad/logo')
  removeLogo(@CurrentUser() p: AuthPrincipal): Promise<RiadSettingsDto> {
    return this.settings.removeLogo(p);
  }

  /** Every staff page shows the logo; the URL carries ?v=<version>, so it can be cached. */
  @AuthenticatedOnly()
  @Get('riad/logo')
  async logo(@CurrentUser() p: AuthPrincipal, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const body = await this.settings.logo(p.riadId);
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=31536000, immutable' });
    return new StreamableFile(body);
  }
}
