import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasAllPermissions, hasAnyPermission } from '@riad/shared';
import { AppException } from '../app-exception';
import {
  ANY_PERMISSION_KEY,
  AUTHENTICATED_ONLY_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
} from './decorators';
import type { RequestWithPrincipal } from './principal';

/**
 * RBAC on every route, deny by default: a route must be @Public(), @AuthenticatedOnly(),
 * or declare @RequirePermissions(...) and/or @RequireAnyPermission(...). A route with none
 * of these is rejected, so a forgotten decorator can never expose data.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<RequestWithPrincipal>();
    if (!req.principal) {
      throw new AppException('UNAUTHORIZED', 'Not authenticated', HttpStatus.UNAUTHORIZED);
    }

    const required = this.reflector.getAllAndMerge<string[]>(PERMISSIONS_KEY, targets) ?? [];
    const anyOf = this.reflector.getAllAndOverride<string[] | undefined>(ANY_PERMISSION_KEY, targets) ?? [];
    if (required.length > 0 || anyOf.length > 0) {
      const granted = req.principal.permissions;
      const okAll = hasAllPermissions(granted, required);
      const okAny = anyOf.length === 0 || hasAnyPermission(granted, anyOf);
      if (okAll && okAny) return true;
      throw new AppException('FORBIDDEN', 'Missing permission', HttpStatus.FORBIDDEN, {
        required,
        anyOf: anyOf.length ? anyOf : undefined,
      });
    }

    if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_ONLY_KEY, targets)) return true;

    throw new AppException(
      'FORBIDDEN',
      'Route has no permission policy (deny by default)',
      HttpStatus.FORBIDDEN,
    );
  }
}
