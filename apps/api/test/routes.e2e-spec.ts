import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { PERMISSIONS as P } from '@riad/shared';
import {
  ANY_PERMISSION_KEY,
  AUTHENTICATED_ONLY_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
} from '../src/common/auth/decorators';
import { createApp } from './fixtures';

type Route = { route: string; isPublic: boolean; authOnly: boolean; all: string[]; any: string[] };

/** Every HTTP route of the real app with the access policy its decorators declare. */
function inventory(app: INestApplication): Route[] {
  const reflector = app.get(Reflector);
  const routes: Route[] = [];
  for (const mod of app.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const ctrl = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!ctrl) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '');
      for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
        const handler: unknown = (ctrl.prototype as Record<string, unknown>)[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const path: unknown = Reflect.getMetadata(PATH_METADATA, handler);
        if (path === undefined) continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
        const full = [base, String(path)].map((s) => s.replace(/^\/|\/$/g, '')).filter(Boolean).join('/');
        const targets = [handler, ctrl];
        routes.push({
          route: `${method} ${full}`,
          isPublic: !!reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets),
          authOnly: !!reflector.getAllAndOverride<boolean>(AUTHENTICATED_ONLY_KEY, targets),
          all: reflector.getAllAndMerge<string[]>(PERMISSIONS_KEY, targets) ?? [],
          any: reflector.getAllAndOverride<string[] | undefined>(ANY_PERMISSION_KEY, targets) ?? [],
        });
      }
    }
  }
  return routes.sort((a, b) => a.route.localeCompare(b.route));
}

describe('Route access policy (every route)', () => {
  let app: INestApplication;
  let routes: Route[];

  beforeAll(async () => {
    app = await createApp();
    routes = inventory(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(80);
  });

  it('declares a policy on every route (deny-by-default never has to kick in)', () => {
    const undeclared = routes.filter((r) => !r.isPublic && !r.authOnly && r.all.length === 0 && r.any.length === 0);
    expect(undeclared.map((r) => r.route)).toEqual([]);
  });

  it('keeps the public surface to auth, health and the guest check-in', () => {
    expect(routes.filter((r) => r.isPublic).map((r) => r.route)).toEqual([
      'GET checkin/context',
      'GET health',
      'POST auth/login',
      'POST auth/logout',
      'POST auth/refresh',
      'POST checkin/scan-passport',
      'POST checkin/submit',
    ]);
  });

  it('keeps "any signed-in staff" routes to the session, the logo and the badge clock', () => {
    expect(routes.filter((r) => r.authOnly).map((r) => r.route)).toEqual([
      'GET auth/me',
      'GET riad/logo',
      'POST auth/change-password',
      'POST staff/clock',
    ]);
  });

  const requireEach = (prefix: RegExp, perms: string[]) => () => {
    const scoped = routes.filter((r) => prefix.test(r.route.split(' ')[1]!));
    expect(scoped.length).toBeGreaterThan(0);
    const leaks = scoped.filter((r) => !perms.some((p) => r.all.includes(p)));
    expect(leaks.map((r) => r.route)).toEqual([]);
  };

  it('puts every HR route behind hr.*', requireEach(/^hr\//, [P.HR_READ, P.HR_WRITE]));
  it('puts finance and tax reports behind finance.reports', requireEach(/^(finance|tax-report)/, [P.FINANCE_REPORTS]));
  it('puts tax rates behind tax.settings', requireEach(/^tax-settings/, [P.TAX_SETTINGS]));
  it('puts riad settings behind settings.riad', requireEach(/^settings\//, [P.SETTINGS_RIAD]));
  it('puts users and roles behind users.manage', requireEach(/^(users|roles)/, [P.USERS_MANAGE]));
  it('puts the audit log behind audit.read', requireEach(/^audit/, [P.AUDIT_READ]));
});
