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

/**
 * Default rights (the seed, and "Reset to default" in the role editor). The owner always
 * has everything; a manager too, but only owners can touch owner accounts and edit roles.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  OWNER: [...ALL_PERMISSIONS],
  MANAGER: [...ALL_PERMISSIONS],
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

/** The owner role always holds every right: it cannot be edited. */
export const LOCKED_ROLE_KEYS: readonly string[] = ['OWNER'];

/** Rights that only make sense with another one: granting the first grants the second. */
export const IMPLIED_PERMISSIONS: Partial<Record<Permission, Permission[]>> = {
  [P.STAYS_WRITE]: [P.STAYS_READ],
  [P.CHECKIN_CONFIRM]: [P.STAYS_READ],
  [P.ROOMS_WRITE]: [P.ROOMS_READ],
  [P.ROOMS_STATUS_UPDATE]: [P.ROOMS_READ],
  [P.PAYMENTS_WRITE]: [P.STAYS_READ],
  [P.EXPENSES_WRITE]: [P.EXPENSES_READ_ALL],
  [P.HR_WRITE]: [P.HR_READ],
};

/** A set of rights with everything they imply, in the order of ALL_PERMISSIONS. */
export function withImplied(codes: readonly string[]): Permission[] {
  const set = new Set(codes.filter((c): c is Permission => (ALL_PERMISSIONS as string[]).includes(c)));
  for (const c of [...set]) for (const dep of IMPLIED_PERMISSIONS[c] ?? []) set.add(dep);
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

/** How the role editor groups the rights. */
export const PERMISSION_GROUPS: { key: 'stays' | 'money' | 'staff' | 'admin'; permissions: Permission[] }[] = [
  { key: 'stays', permissions: [P.STAYS_READ, P.STAYS_WRITE, P.CHECKIN_CONFIRM, P.ROOMS_READ, P.ROOMS_WRITE, P.ROOMS_STATUS_UPDATE] },
  { key: 'money', permissions: [P.PAYMENTS_WRITE, P.EXPENSES_WRITE_PETTY_CASH, P.EXPENSES_WRITE, P.EXPENSES_READ_ALL, P.FINANCE_REPORTS, P.TAX_SETTINGS] },
  { key: 'staff', permissions: [P.HR_READ, P.HR_WRITE] },
  { key: 'admin', permissions: [P.USERS_MANAGE, P.SETTINGS_RIAD, P.AUDIT_READ] },
];

/**
 * May someone with `actor` role/rights give the `target` role, or touch an account that has
 * it? Owner accounts and the owner role: owners only. Others: no privilege escalation (the
 * actor must hold every right of the target).
 */
export function canManageRole(
  actor: { key: string; permissions: readonly string[] },
  target: { key: string; permissions: readonly string[] },
): boolean {
  if (target.key === 'OWNER') return actor.key === 'OWNER';
  return hasAllPermissions(actor.permissions, target.permissions);
}
