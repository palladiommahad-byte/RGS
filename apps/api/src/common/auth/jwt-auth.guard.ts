import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';
import { AppException } from '../app-exception';
import { IS_PUBLIC_KEY } from './decorators';
import { PrincipalCacheService } from './principal-cache.service';
import { ACCESS_COOKIE, type AccessTokenPayload, type RequestWithPrincipal } from './principal';

/** Authenticates every non-@Public route from the access-token cookie (or Bearer header). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly principals: PrincipalCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const token = this.extractToken(req);
    if (!token) throw this.unauthorized('Missing access token');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: env().JWT_ACCESS_SECRET,
      });
    } catch {
      throw this.unauthorized('Invalid or expired access token');
    }

    const principal = await this.principals.get(payload.sub);
    if (!principal || principal.riadId !== payload.riadId) {
      throw this.unauthorized('User is disabled or no longer exists');
    }
    req.principal = principal;
    return true;
  }

  private extractToken(req: RequestWithPrincipal): string | undefined {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const fromCookie = cookies?.[ACCESS_COOKIE];
    if (fromCookie) return fromCookie;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }

  private unauthorized(message: string): AppException {
    return new AppException('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);
  }
}
