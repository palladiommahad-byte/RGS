import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from './principal';

type Entry = { value: AuthPrincipal | null; expiresAt: number };

/**
 * Loads a user's role and permissions from the database (the source of truth), with a
 * short in-memory cache so role edits take effect within TTL_MS without a DB hit per request.
 */
@Injectable()
export class PrincipalCacheService {
  private static readonly TTL_MS = 30_000;
  private readonly cache = new Map<string, Entry>();

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<AuthPrincipal | null> {
    const hit = this.cache.get(userId);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        riadId: true,
        isActive: true,
        role: {
          select: {
            id: true,
            key: true,
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });
    const value: AuthPrincipal | null =
      user && user.isActive
        ? {
            userId: user.id,
            riadId: user.riadId,
            roleId: user.role.id,
            roleKey: user.role.key,
            permissions: user.role.permissions.map((rp) => rp.permission.code),
          }
        : null;
    this.cache.set(userId, { value, expiresAt: Date.now() + PrincipalCacheService.TTL_MS });
    return value;
  }

  invalidate(userId?: string): void {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }
}
