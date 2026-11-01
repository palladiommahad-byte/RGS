import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  canManageRole,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSIONS,
  hasAllPermissions,
  isHrPermission,
  withImplied,
} from './permissions';

describe('default role matrix', () => {
  it('gives HR permissions only to owner and manager', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.OWNER.some(isHrPermission)).toBe(true);
    expect(DEFAULT_ROLE_PERMISSIONS.MANAGER.some(isHrPermission)).toBe(true);
    expect(DEFAULT_ROLE_PERMISSIONS.RECEPTION.some(isHrPermission)).toBe(false);
    expect(DEFAULT_ROLE_PERMISSIONS.HOUSEKEEPING.some(isHrPermission)).toBe(false);
  });

  it('gives owner and manager every right', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.OWNER).toEqual(ALL_PERMISSIONS);
    expect(DEFAULT_ROLE_PERMISSIONS.MANAGER).toEqual(ALL_PERMISSIONS);
  });

  it('keeps finance, taxes, staff, users, settings and the activity log away from reception', () => {
    const r = DEFAULT_ROLE_PERMISSIONS.RECEPTION;
    for (const p of [PERMISSIONS.FINANCE_REPORTS, PERMISSIONS.TAX_SETTINGS, PERMISSIONS.HR_READ, PERMISSIONS.USERS_MANAGE, PERMISSIONS.SETTINGS_RIAD, PERMISSIONS.AUDIT_READ]) {
      expect(r).not.toContain(p);
    }
  });

  it('limits housekeeping to room status', () => {
    expect([...DEFAULT_ROLE_PERMISSIONS.HOUSEKEEPING].sort()).toEqual(
      [PERMISSIONS.ROOMS_READ, PERMISSIONS.ROOMS_STATUS_UPDATE].sort(),
    );
  });

  it('keeps finance and full expense reads away from reception', () => {
    const r = DEFAULT_ROLE_PERMISSIONS.RECEPTION;
    expect(r).not.toContain(PERMISSIONS.FINANCE_REPORTS);
    expect(r).not.toContain(PERMISSIONS.EXPENSES_READ_ALL);
    expect(r).not.toContain(PERMISSIONS.EXPENSES_WRITE);
    expect(r).toContain(PERMISSIONS.EXPENSES_WRITE_PETTY_CASH);
  });
});

describe('role assignment (no privilege escalation)', () => {
  const can = (actor: readonly string[], target: readonly string[]) => hasAllPermissions(actor, target);

  it('lets the owner give any role', () => {
    for (const role of Object.values(DEFAULT_ROLE_PERMISSIONS)) expect(can(DEFAULT_ROLE_PERMISSIONS.OWNER, role)).toBe(true);
  });

  const role = (key: keyof typeof DEFAULT_ROLE_PERMISSIONS) => ({ key, permissions: DEFAULT_ROLE_PERMISSIONS[key] });

  it('stops a manager from creating or managing an owner, even with every right', () => {
    expect(canManageRole(role('MANAGER'), role('OWNER'))).toBe(false);
    expect(canManageRole(role('OWNER'), role('OWNER'))).toBe(true);
    expect(canManageRole(role('MANAGER'), role('RECEPTION'))).toBe(true);
    expect(canManageRole(role('MANAGER'), role('MANAGER'))).toBe(true);
    // A reception with an extra right cannot be managed by someone lacking it.
    expect(canManageRole({ key: 'X', permissions: [PERMISSIONS.STAYS_READ] }, role('RECEPTION'))).toBe(false);
  });
});

describe('role editor helpers', () => {
  it('adds the rights a right needs', () => {
    expect(withImplied([PERMISSIONS.STAYS_WRITE, PERMISSIONS.HR_WRITE])).toEqual([PERMISSIONS.STAYS_READ, PERMISSIONS.STAYS_WRITE, PERMISSIONS.HR_READ, PERMISSIONS.HR_WRITE]);
    expect(withImplied(['nope', PERMISSIONS.AUDIT_READ])).toEqual([PERMISSIONS.AUDIT_READ]);
  });

  it('groups every right exactly once', () => {
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.permissions);
    expect([...grouped].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('defaults already include what their rights need', () => {
    for (const perms of Object.values(DEFAULT_ROLE_PERMISSIONS)) expect([...withImplied(perms)].sort()).toEqual([...perms].sort());
  });
});
