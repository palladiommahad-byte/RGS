import type { Request } from 'express';

/** The authenticated staff user. `riadId` is the ONLY source for tenant scoping. */
export type AuthPrincipal = {
  userId: string;
  riadId: string;
  roleId: string;
  roleKey: string;
  permissions: string[];
};

export type AccessTokenPayload = {
  sub: string;
  riadId: string;
  roleId: string;
};

export type RequestWithPrincipal = Request & { principal?: AuthPrincipal };

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
