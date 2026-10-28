import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS as P,
  type GuestDto,
  type GuestFilesDto,
  type Paginated,
  type StayDetailDto,
  type StaySummaryDto,
  type TodayDto,
} from '@riad/shared';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import {
  ConfirmStayDto,
  CreateStayDto,
  GuestInputDto,
  ListStaysQueryDto,
  UpdateGuestDto,
  UpdateStayDto,
} from './stays.dto';
import { StaysService } from './stays.service';

@ApiTags('stays')
@Controller('stays')
export class StaysController {
  constructor(private readonly stays: StaysService) {}

  @RequirePermissions(P.STAYS_READ)
  @Get()
  list(@CurrentUser() p: AuthPrincipal, @Query() q: ListStaysQueryDto): Promise<Paginated<StaySummaryDto>> {
    return this.stays.list(p, q);
  }

  @RequirePermissions(P.STAYS_READ)
  @Get(':id')
  get(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<StayDetailDto> {
    return this.stays.get(p, id);
  }

  @RequirePermissions(P.STAYS_WRITE)
  @Post()
  create(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateStayDto): Promise<StayDetailDto> {
    return this.stays.create(p, dto);
  }

  @RequirePermissions(P.STAYS_WRITE)
  @Patch(':id')
  update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStayDto,
  ): Promise<StayDetailDto> {
    return this.stays.update(p, id, dto);
  }

  @RequirePermissions(P.CHECKIN_CONFIRM)
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmStayDto,
  ): Promise<StayDetailDto> {
    return this.stays.confirm(p, id, dto);
  }

  @RequirePermissions(P.STAYS_WRITE)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<StayDetailDto> {
    return this.stays.cancel(p, id);
  }

  @RequirePermissions(P.STAYS_WRITE)
  @Post(':id/checkout')
  @HttpCode(HttpStatus.OK)
  checkout(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<StayDetailDto> {
    return this.stays.checkout(p, id);
  }

  @RequirePermissions(P.CHECKIN_CONFIRM)
  @Post(':id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.stays.reject(p, id);
  }

  @RequirePermissions(P.STAYS_READ)
  @Get(':id/guests/:guestId/files')
  guestFiles(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('guestId', ParseUUIDPipe) guestId: string,
  ): Promise<GuestFilesDto> {
    return this.stays.guestFiles(p, id, guestId);
  }

  @RequirePermissions(P.STAYS_WRITE)
  @Post(':id/guests')
  addGuest(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuestInputDto,
  ): Promise<GuestDto> {
    return this.stays.addGuest(p, id, dto);
  }

  @RequirePermissions(P.STAYS_WRITE)
  @Patch(':id/guests/:guestId')
  updateGuest(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('guestId', ParseUUIDPipe) guestId: string,
    @Body() dto: UpdateGuestDto,
  ): Promise<GuestDto> {
    return this.stays.updateGuest(p, id, guestId, dto);
  }

  @RequirePermissions(P.STAYS_WRITE)
  @Delete(':id/guests/:guestId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeGuest(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('guestId', ParseUUIDPipe) guestId: string,
  ): Promise<void> {
    return this.stays.removeGuest(p, id, guestId);
  }
}

@ApiTags('stays')
@Controller('today')
export class TodayController {
  constructor(private readonly stays: StaysService) {}

  @RequirePermissions(P.STAYS_READ)
  @Get()
  today(@CurrentUser() p: AuthPrincipal): Promise<TodayDto> {
    return this.stays.today(p);
  }
}
