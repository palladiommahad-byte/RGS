import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  type RoleKey,
} from '@riad/shared';
import type { NextFunction, Response } from 'express';
import request from 'supertest';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { AuthenticatedOnly, Public, RequireAnyPermission, RequirePermissions } from './decorators';
import { PermissionsGuard } from './permissions.guard';
import type { RequestWithPrincipal } from './principal';

@Controller('t')
class ProbeController {
  @Public() @Get('public') pub() { return { ok: true }; }
  @AuthenticatedOnly() @Get('me') me() { return { ok: true }; }
  @RequirePermissions(PERMISSIONS.HR_READ) @Get('hr') hr() { return { ok: true }; }
  @RequirePermissions(PERMISSIONS.STAYS_READ) @Get('stays') stays() { return { ok: true }; }
  @RequirePermissions(PERMISSIONS.FINANCE_REPORTS) @Get('finance') finance() { return { ok: true }; }
  @RequirePermissions(PERMISSIONS.SETTINGS_RIAD) @Get('settings') settings() { return { ok: true }; }
  @RequirePermissions(PERMISSIONS.ROOMS_STATUS_UPDATE) @Get('room-status') roomStatus() { return { ok: true }; }
  @RequireAnyPermission(PERMISSIONS.EXPENSES_WRITE, PERMISSIONS.EXPENSES_WRITE_PETTY_CASH) @Get('expense') expense() { return { ok: true }; }
  @RequirePermissions(PERMISSIONS.STAYS_READ) @RequireAnyPermission(PERMISSIONS.EXPENSES_WRITE, PERMISSIONS.HR_READ) @Get('both') both() { return { ok: true }; }
  @Get('undecorated') undecorated() { return { ok: true }; }
}

/**
 * Exercises the real PermissionsGuard over HTTP with the default role matrix.
 * Authentication is stubbed by a middleware that reads the role from a header.
 */
describe('PermissionsGuard (RBAC)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: PermissionsGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: RequestWithPrincipal, _res: Response, next: NextFunction) => {
      const role = req.headers['x-test-role'] as RoleKey | undefined;
      if (role) {
        req.principal = {
          userId: 'u1',
          riadId: 'r1',
          roleId: role,
          roleKey: role,
          permissions: DEFAULT_ROLE_PERMISSIONS[role],
        };
      }
      next();
    });
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(() => app.close());

  const get = (path: string, role?: RoleKey) => {
    const r = request(app.getHttpServer()).get(`/t/${path}`);
    return role ? r.set('x-test-role', role) : r;
  };

  it('allows public routes without a user', async () => {
    await get('public').expect(200);
  });

  it('rejects anonymous access to protected routes with 401', async () => {
    const res = await get('me').expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('denies routes without a permission policy, even for the owner', async () => {
    const res = await get('undecorated', 'OWNER').expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it.each<[string, RoleKey, number]>([
    ['hr', 'OWNER', 200],
    ['hr', 'MANAGER', 200],
    ['hr', 'RECEPTION', 403],
    ['hr', 'HOUSEKEEPING', 403],
    ['stays', 'RECEPTION', 200],
    ['stays', 'HOUSEKEEPING', 403],
    ['finance', 'MANAGER', 200],
    ['finance', 'RECEPTION', 403],
    ['settings', 'OWNER', 200],
    ['settings', 'MANAGER', 403],
    ['room-status', 'HOUSEKEEPING', 200],
    ['me', 'HOUSEKEEPING', 200],
    ['expense', 'RECEPTION', 200],
    ['expense', 'MANAGER', 200],
    ['expense', 'HOUSEKEEPING', 403],
    ['both', 'MANAGER', 200],
    ['both', 'RECEPTION', 403],
  ])('%s as %s -> %i', async (path, role, status) => {
    await get(path, role).expect(status);
  });
});
