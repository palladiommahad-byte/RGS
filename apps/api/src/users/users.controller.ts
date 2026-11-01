import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS as P, type Paginated, type RoleDto, type UserDto } from '@riad/shared';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { CreateUserDto, ListUsersQueryDto, ResetPasswordDto, UpdateRoleDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

/** Accounts are never deleted (the audit log points to them): deactivate instead. */
@ApiTags('users')
@RequirePermissions(P.USERS_MANAGE)
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  list(@CurrentUser() p: AuthPrincipal, @Query() q: ListUsersQueryDto): Promise<Paginated<UserDto>> {
    return this.users.list(p, q);
  }

  @Get('roles')
  roles(@CurrentUser() p: AuthPrincipal): Promise<RoleDto[]> {
    return this.users.roles(p);
  }

  /** Owner only (checked in the service). */
  @Patch('roles/:id')
  updateRole(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto): Promise<RoleDto> {
    return this.users.updateRole(p, id, dto);
  }

  @Post('users')
  create(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateUserDto): Promise<UserDto> {
    return this.users.create(p, dto);
  }

  @Patch('users/:id')
  update(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto): Promise<UserDto> {
    return this.users.update(p, id, dto);
  }

  @Post('users/:id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto): Promise<void> {
    return this.users.resetPassword(p, id, dto.password);
  }
}
