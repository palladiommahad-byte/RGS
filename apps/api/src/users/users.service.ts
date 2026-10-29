import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Role, type User } from '@prisma/client';
import { hasAllPermissions, type Paginated, type RoleDto, type UserDto } from '@riad/shared';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { PrincipalCacheService } from '../common/auth/principal-cache.service';
import type { AuthPrincipal } from '../common/auth/principal';
import { diffFields } from '../common/diff';
import { pageArgs, paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './users.dto';

type Tx = Prisma.TransactionClient;
const roleInclude = { permissions: { select: { permission: { select: { code: true } } } } } as const;
type RoleRow = Role & { permissions: { permission: { code: string } }[] };
const codes = (r: RoleRow) => r.permissions.map((x) => x.permission.code);

/**
 * Staff accounts. Two rules keep this safe:
 * - no privilege escalation: you can only give a role, or touch an account, whose
 *   permissions you hold yourself (a manager cannot create or edit an owner);
 * - no self-lockout: you cannot deactivate yourself or change your own role, so the riad
 *   always keeps an active owner.
 * Deactivation, role changes and password resets end the user's sessions.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly principals: PrincipalCacheService,
  ) {}

  async list(p: AuthPrincipal, q: ListUsersQueryDto): Promise<Paginated<UserDto>> {
    const where: Prisma.UserWhereInput = { riadId: p.riadId };
    if (!q.includeInactive) where.isActive = true;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { role: { include: roleInclude } },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        ...pageArgs(q),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows.map((u) => this.toDto(p, u)), total, q);
  }

  async roles(p: AuthPrincipal): Promise<RoleDto[]> {
    const rows = await this.prisma.role.findMany({
      where: { riadId: p.riadId },
      include: { ...roleInclude, _count: { select: { users: { where: { isActive: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      nameFr: r.nameFr,
      nameAr: r.nameAr,
      permissions: codes(r).sort(),
      userCount: r._count.users,
      assignable: hasAllPermissions(p.permissions, codes(r)),
    }));
  }

  async create(p: AuthPrincipal, dto: CreateUserDto): Promise<UserDto> {
    const role = await this.assignableRole(p, dto.roleId);
    await this.assertEmailFree(dto.email);
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await this.withUniqueEmail(() =>
        tx.user.create({
          data: { riadId: p.riadId, name: dto.name, email: dto.email, roleId: role.id, passwordHash },
          include: { role: { include: roleInclude } },
        }),
      );
      await this.audit.log(
        { riadId: p.riadId, userId: p.userId, action: 'user.create', entity: 'User', entityId: created.id, diff: { name: dto.name, email: dto.email, role: role.key } },
        tx,
      );
      return created;
    });
    return this.toDto(p, user);
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateUserDto): Promise<UserDto> {
    const before = await this.manageable(p, id);
    const self = id === p.userId;
    const roleChanged = dto.roleId !== undefined && dto.roleId !== before.roleId;
    const deactivated = dto.isActive === false && before.isActive;
    if (self && (roleChanged || deactivated)) {
      throw new AppException('CANNOT_CHANGE_SELF', 'You cannot change your own role or deactivate yourself', HttpStatus.CONFLICT);
    }
    const role = roleChanged ? await this.assignableRole(p, dto.roleId!) : null;
    if (dto.email && dto.email !== before.email) await this.assertEmailFree(dto.email);

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await this.withUniqueEmail(() =>
        tx.user.update({
          where: { id },
          data: { name: dto.name, email: dto.email, roleId: role?.id, isActive: dto.isActive },
          include: { role: { include: roleInclude } },
        }),
      );
      if (roleChanged || deactivated) await this.endSessions(tx, id);
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'user.update',
          entity: 'User',
          entityId: id,
          diff: { ...diffFields(before, updated, ['name', 'email', 'isActive']), ...(role ? { role: [before.role.key, role.key] } : {}) },
        },
        tx,
      );
      return updated;
    });
    this.principals.invalidate(id);
    return this.toDto(p, user);
  }

  /** Sets a temporary password chosen by a manager; the user's sessions end. */
  async resetPassword(p: AuthPrincipal, id: string, password: string): Promise<void> {
    if (id === p.userId) {
      throw new AppException('CANNOT_CHANGE_SELF', 'Use "change my password" for your own account', HttpStatus.CONFLICT);
    }
    await this.manageable(p, id);
    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await this.endSessions(tx, id);
      await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'user.password_reset', entity: 'User', entityId: id }, tx);
    });
    this.principals.invalidate(id);
  }

  private async manageable(p: AuthPrincipal, id: string): Promise<User & { role: RoleRow }> {
    const target = await this.prisma.user.findFirst({ where: { id, riadId: p.riadId }, include: { role: { include: roleInclude } } });
    if (!target) throw new AppException('NOT_FOUND', 'User not found', HttpStatus.NOT_FOUND);
    if (!hasAllPermissions(p.permissions, codes(target.role))) {
      throw new AppException('USER_NOT_MANAGEABLE', 'This account has rights you do not have', HttpStatus.FORBIDDEN);
    }
    return target;
  }

  private async assignableRole(p: AuthPrincipal, roleId: string): Promise<RoleRow> {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, riadId: p.riadId }, include: roleInclude });
    if (!role) throw new AppException('NOT_FOUND', 'Role not found', HttpStatus.NOT_FOUND);
    if (!hasAllPermissions(p.permissions, codes(role))) {
      throw new AppException('ROLE_NOT_ASSIGNABLE', 'You cannot give a role with rights you do not have', HttpStatus.FORBIDDEN);
    }
    return role;
  }

  private async assertEmailFree(email: string): Promise<void> {
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) throw emailTaken();
  }

  /** Emails are unique across all riads; a concurrent insert still maps to EMAIL_TAKEN. */
  private async withUniqueEmail<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw emailTaken();
      throw e;
    }
  }

  private async endSessions(tx: Tx, userId: string): Promise<void> {
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private toDto(p: AuthPrincipal, u: User & { role: RoleRow }): UserDto {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: { id: u.role.id, key: u.role.key, nameFr: u.role.nameFr, nameAr: u.role.nameAr },
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      isSelf: u.id === p.userId,
      manageable: hasAllPermissions(p.permissions, codes(u.role)),
    };
  }
}

function emailTaken(): AppException {
  return new AppException('EMAIL_TAKEN', 'This email is already used', HttpStatus.CONFLICT);
}
