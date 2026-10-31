import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS as P, type NotificationListDto } from '@riad/shared';
import { IsBoolean, IsOptional } from 'class-validator';
import { CurrentUser, RequireAnyPermission } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { PaginationQueryDto } from '../common/pagination';
import { QueryBoolean } from '../common/validation';
import { NotificationsService } from './notifications.service';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @QueryBoolean() @IsBoolean() unread?: boolean;
}

/** Each person's notifications; what they contain is filtered by permission in the service. */
@ApiTags('notifications')
@RequireAnyPermission(P.STAYS_READ, P.ROOMS_READ, P.EXPENSES_READ_ALL, P.EXPENSES_WRITE_PETTY_CASH)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() p: AuthPrincipal, @Query() q: ListNotificationsQueryDto): Promise<NotificationListDto> {
    return this.notifications.list(p, q);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@CurrentUser() p: AuthPrincipal): Promise<{ unread: number }> {
    return this.notifications.markRead(p);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  read(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<{ unread: number }> {
    return this.notifications.markRead(p, id);
  }
}
