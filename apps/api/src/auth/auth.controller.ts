import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '@riad/shared';
import type { CookieOptions, Request, Response } from 'express';
import { AppException } from '../common/app-exception';
import { AuthenticatedOnly, CurrentUser, Public } from '../common/auth/decorators';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  type AuthPrincipal,
} from '../common/auth/principal';
import { env } from '../config/env';
import { AuthService, type IssuedTokens } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const { user, tokens } = await this.auth.login(dto.email, dto.password, clientInfo(req));
    setAuthCookies(res, tokens);
    return user;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const raw = readCookie(req, REFRESH_COOKIE);
    if (!raw) {
      throw new AppException('INVALID_REFRESH_TOKEN', 'No session', HttpStatus.UNAUTHORIZED);
    }
    try {
      setAuthCookies(res, await this.auth.refresh(raw, clientInfo(req)));
    } catch (e) {
      clearAuthCookies(res);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readCookie(req, REFRESH_COOKIE));
    clearAuthCookies(res);
  }

  @AuthenticatedOnly()
  @Get('me')
  me(@CurrentUser() principal: AuthPrincipal): Promise<AuthUser> {
    return this.auth.getAuthUser(principal.userId);
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[name];
}

function clientInfo(req: Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

function baseCookie(): CookieOptions {
  return { httpOnly: true, secure: env().COOKIE_SECURE, sameSite: 'lax' };
}

function setAuthCookies(res: Response, tokens: IssuedTokens): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookie(),
    path: '/',
    maxAge: tokens.accessTtlSeconds * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie(),
    path: REFRESH_COOKIE_PATH,
    maxAge: tokens.refreshTtlSeconds * 1000,
  });
  // Non-sensitive flag readable by Next.js middleware to know a session may exist
  // (the refresh cookie itself is path-scoped to the auth endpoints).
  res.cookie('has_session', '1', {
    ...baseCookie(),
    path: '/',
    maxAge: tokens.refreshTtlSeconds * 1000,
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: REFRESH_COOKIE_PATH });
  res.clearCookie('has_session', { ...baseCookie(), path: '/' });
}
