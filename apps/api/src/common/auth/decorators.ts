import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@riad/shared';
import type { AuthPrincipal, RequestWithPrincipal } from './principal';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const AUTHENTICATED_ONLY_KEY = 'auth:authenticatedOnly';
export const PERMISSIONS_KEY = 'auth:permissions';

/** No authentication required (guest check-in, public site, login). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Any logged-in user, no specific permission (e.g. /auth/me). */
export const AuthenticatedOnly = () => SetMetadata(AUTHENTICATED_ONLY_KEY, true);

/** The user must hold ALL listed permissions. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const req = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
    if (!req.principal) throw new Error('CurrentUser used on a route without authentication');
    return req.principal;
  },
);
