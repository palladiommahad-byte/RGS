/**
 * Permission codes. The database (`permissions`, `role_permissions`) is the source of
 * truth at runtime; this file defines the codes and the default matrix used by the seed.
 */
export const PERMISSIONS = {
  STAYS_READ: 'stays.read',
  STAYS_WRITE: 'stays.write',
  CHECKIN_CONFIRM: 'checkin.confirm',
  ROOMS_READ: 'rooms.read',
  ROOMS_WRITE: 'rooms.write',
  ROOMS_STATUS_UPDATE: 'rooms.status.update',
  PAYMENTS_WRITE: 'payments.write',
  EXPENSES_WRITE: 'expenses.write',
  /** Reception: may only log expenses against their petty-cash wallet. */
  EXPENSES_WRITE_PETTY_CASH: 'expenses.write_petty_cash',
  EXPENSES_READ_ALL: 'expenses.read_all',
  FINANCE_REPORTS: 'finance.reports',
  TAX_SETTINGS: 'tax.settings',
  HR_READ: 'hr.read',
  HR_WRITE: 'hr.write',
  USERS_MANAGE: 'users.manage',
  SETTINGS_RIAD: 'settings.riad',
  AUDIT_READ: 'audit.read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

export const ROLE_KEYS = ['OWNER', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

const P = PERMISSIONS;

const MANAGER_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter((p) => p !== P.SETTINGS_RIAD);

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  OWNER: [...ALL_PERMISSIONS],
  MANAGER: MANAGER_PERMISSIONS,
  RECEPTION: [
    P.STAYS_READ,
    P.STAYS_WRITE,
    P.CHECKIN_CONFIRM,
    P.ROOMS_READ,
    P.ROOMS_STATUS_UPDATE,
    P.PAYMENTS_WRITE,
    P.EXPENSES_WRITE_PETTY_CASH,
  ],
  HOUSEKEEPING: [P.ROOMS_READ, P.ROOMS_STATUS_UPDATE],
};

export const ROLE_NAMES: Record<RoleKey, { fr: string; en: string; ar: string }> = {
  OWNER: { fr: 'Propriétaire', en: 'Owner', ar: 'المالك' },
  MANAGER: { fr: 'Gérant', en: 'Manager', ar: 'المدير' },
  RECEPTION: { fr: 'Réception', en: 'Reception', ar: 'الاستقبال' },
  HOUSEKEEPING: { fr: 'Ménage', en: 'Housekeeping', ar: 'التدبير المنزلي' },
};

export function isHrPermission(p: string): boolean {
  return p.startsWith('hr.');
}

/** True if `granted` satisfies every permission in `required`. */
export function hasAllPermissions(granted: readonly string[], required: readonly string[]): boolean {
  const set = new Set(granted);
  return required.every((r) => set.has(r));
}

/** True if `granted` satisfies at least one permission in `required`. */
export function hasAnyPermission(granted: readonly string[], required: readonly string[]): boolean {
  const set = new Set(granted);
  return required.some((r) => set.has(r));
}
