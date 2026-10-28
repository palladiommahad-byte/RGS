import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, isHrPermission } from './permissions';

describe('default role matrix', () => {
  it('gives HR permissions only to owner and manager', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.OWNER.some(isHrPermission)).toBe(true);
    expect(DEFAULT_ROLE_PERMISSIONS.MANAGER.some(isHrPermission)).toBe(true);
    expect(DEFAULT_ROLE_PERMISSIONS.RECEPTION.some(isHrPermission)).toBe(false);
    expect(DEFAULT_ROLE_PERMISSIONS.HOUSEKEEPING.some(isHrPermission)).toBe(false);
  });

  it('reserves riad settings for the owner', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.OWNER).toContain(PERMISSIONS.SETTINGS_RIAD);
    expect(DEFAULT_ROLE_PERMISSIONS.MANAGER).not.toContain(PERMISSIONS.SETTINGS_RIAD);
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
