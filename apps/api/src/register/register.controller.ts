import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS as P, type GuestRegisterRowDto, type Paginated } from '@riad/shared';
import type { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { RegisterExportQueryDto, RegisterQueryDto } from './register.dto';
import { RegisterService } from './register.service';

@ApiTags('guests')
@Controller('guests')
export class RegisterController {
  constructor(private readonly register: RegisterService) {}

  @RequirePermissions(P.STAYS_READ)
  @Get()
  list(@CurrentUser() p: AuthPrincipal, @Query() q: RegisterQueryDto): Promise<Paginated<GuestRegisterRowDto>> {
    return this.register.list(p, q);
  }

  /** Police fiche export (CSV or Excel) for a period. */
  @RequirePermissions(P.STAYS_READ)
  @Get('export')
  async export(
    @CurrentUser() p: AuthPrincipal,
    @Query() q: RegisterExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.register.export(p, q);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(file.body);
  }
}
