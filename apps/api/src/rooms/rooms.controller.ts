import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS as P, type Paginated, type RoomDto } from '@riad/shared';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { CreateRoomDto, ListRoomsQueryDto, SetRoomStatusDto, UpdateRoomDto } from './rooms.dto';
import { RoomsService } from './rooms.service';

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @RequirePermissions(P.ROOMS_READ)
  @Get()
  list(@CurrentUser() p: AuthPrincipal, @Query() q: ListRoomsQueryDto): Promise<Paginated<RoomDto>> {
    return this.rooms.list(p, q);
  }

  @RequirePermissions(P.ROOMS_READ)
  @Get(':id')
  get(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<RoomDto> {
    return this.rooms.get(p, id);
  }

  @RequirePermissions(P.ROOMS_WRITE)
  @Post()
  create(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateRoomDto): Promise<RoomDto> {
    return this.rooms.create(p, dto);
  }

  @RequirePermissions(P.ROOMS_WRITE)
  @Patch(':id')
  update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomDto> {
    return this.rooms.update(p, id, dto);
  }

  @RequirePermissions(P.ROOMS_STATUS_UPDATE)
  @Patch(':id/status')
  setStatus(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoomStatusDto,
  ): Promise<RoomDto> {
    return this.rooms.setStatus(p, id, dto.status);
  }

  @RequirePermissions(P.ROOMS_WRITE)
  @Post(':id/qr-token')
  regenerateQr(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoomDto> {
    return this.rooms.regenerateQr(p, id);
  }

  @RequirePermissions(P.ROOMS_WRITE)
  @Delete(':id')
  remove(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.remove(p, id);
  }
}
