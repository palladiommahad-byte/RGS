import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { asAppTheme, type AuthUser } from '@riad/shared';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AppException } from '../common/app-exception';
import { PrincipalCacheService } from '../common/auth/principal-cache.service';
import type { AccessTokenPayload } from '../common/auth/principal';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
};

type ClientInfo = { userAgent?: string; ip?: string };

/** Logo keys end with "logo-<timestamp>.png": the timestamp busts browser caches. */
export const logoVersion = (key: string | null) => key?.match(/logo-(\d+)\.png$/)?.[1] ?? null;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// Verified against when the email is unknown, so response time does not reveal
// whether an account exists.
const DUMMY_HASH_PROMISE = argon2.hash('timing-equaliser-not-a-real-password');

// Per-account brake on password guessing (the per-IP rate limit alone lets many IPs try one
// account): after MAX_FAILURES wrong passwords within WINDOW_MS the email is refused for
// LOCK_MS. Kept in memory: one API process per riad; a restart clears it.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
type Failures = { count: number; since: number; lockedUntil: number };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly principals: PrincipalCacheService,
  ) {}

  private readonly failures = new Map<string, Failures>();

  async login(
    email: string,
    password: string,
    client: ClientInfo,
  ): Promise<{ user: AuthUser; tokens: IssuedTokens }> {
    const account = email.trim().toLowerCase();
    const now = Date.now();
    if ((this.failures.get(account)?.lockedUntil ?? 0) > now) {
      throw new AppException('TOO_MANY_ATTEMPTS', 'Too many failed sign-ins: try again in a few minutes', HttpStatus.TOO_MANY_REQUESTS);
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user
      ? await argon2.verify(user.passwordHash, password)
      : await argon2.verify(await DUMMY_HASH_PROMISE, password).then(() => false);
    if (!user || !valid || !user.isActive) {
      this.recordFailure(account, now);
      throw new AppException(
        'INVALID_CREDENTIALS',
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }
    this.failures.delete(account);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.issueTokens(user.id, user.riadId, user.roleId, client);
    return { user: await this.getAuthUser(user.id), tokens };
  }

  /** Rotates the refresh token. Re-use of a revoked token revokes every session of the user. */
  async refresh(rawToken: string, client: ClientInfo): Promise<IssuedTokens> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });
    if (!stored) throw this.invalidRefresh();
    if (stored.revokedAt) {
      await this.revokeAllForUser(stored.userId);
      throw this.invalidRefresh();
    }
    if (stored.expiresAt < new Date() || !stored.user.isActive) throw this.invalidRefresh();

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(stored.user.id, stored.user.riadId, stored.user.roleId, client);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private recordFailure(account: string, now: number): void {
    // Forget stale entries so the map stays small.
    if (this.failures.size > 1000) {
      for (const [k, v] of this.failures) if (now - v.since > WINDOW_MS && v.lockedUntil < now) this.failures.delete(k);
    }
    const f = this.failures.get(account);
    const current = f && now - f.since <= WINDOW_MS ? f : { count: 0, since: now, lockedUntil: 0 };
    current.count++;
    if (current.count >= MAX_FAILURES) {
      current.lockedUntil = now + LOCK_MS;
      current.count = 0;
      current.since = now;
    }
    this.failures.set(account, current);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.principals.invalidate(userId);
  }

  async getAuthUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        riad: { select: { id: true, name: true, logoKey: true, theme: true } },
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    return {
      id: user.id,
      riadId: user.riadId,
      name: user.name,
      email: user.email,
      role: {
        id: user.role.id,
        key: user.role.key,
        nameFr: user.role.nameFr,
        nameAr: user.role.nameAr,
      },
      permissions: user.role.permissions.map((rp) => rp.permission.code).sort(),
      riad: { id: user.riad.id, name: user.riad.name, logoVersion: logoVersion(user.riad.logoKey), theme: asAppTheme(user.riad.theme) },
    };
  }

  /**
   * The user changes their own password: every other session is signed out, the current
   * one gets fresh tokens.
   */
  async changePassword(userId: string, current: string, next: string, client: ClientInfo): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current))) {
      throw new AppException('WRONG_PASSWORD', 'The current password is wrong', HttpStatus.BAD_REQUEST);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(next) } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { riadId: user.riadId, userId, action: 'user.password_change', entity: 'User', entityId: userId } });
    });
    return this.issueTokens(user.id, user.riadId, user.roleId, client);
  }

  private async issueTokens(
    userId: string,
    riadId: string,
    roleId: string,
    client: ClientInfo,
  ): Promise<IssuedTokens> {
    const { JWT_ACCESS_SECRET, JWT_ACCESS_TTL_SECONDS, JWT_REFRESH_TTL_SECONDS } = env();
    const payload: AccessTokenPayload = { sub: userId, riadId, roleId };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: JWT_ACCESS_SECRET,
      expiresIn: JWT_ACCESS_TTL_SECONDS,
    });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + JWT_REFRESH_TTL_SECONDS * 1000),
        userAgent: client.userAgent?.slice(0, 255),
        ip: client.ip,
      },
    });
    return {
      accessToken,
      refreshToken,
      accessTtlSeconds: JWT_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: JWT_REFRESH_TTL_SECONDS,
    };
  }

  private invalidRefresh(): AppException {
    return new AppException(
      'INVALID_REFRESH_TOKEN',
      'Session expired, please log in again',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
