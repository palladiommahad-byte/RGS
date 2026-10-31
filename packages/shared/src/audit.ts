/**
 * Audit log areas. An action is "<subject>.<verb>" (e.g. "expense.delete"); each area
 * groups the subjects shown together on the audit page.
 */
export const AUDIT_AREAS = {
  stays: ['stay', 'guest', 'register'],
  billing: ['payment', 'extra', 'invoice'],
  expenses: ['expense', 'supplier', 'wallet', 'recurring'],
  rooms: ['room'],
  hr: ['employee', 'attendance', 'leave', 'payroll'],
  finance: ['finance', 'tax_setting', 'tax_report'],
  admin: ['user', 'riad'],
} as const satisfies Record<string, readonly string[]>;

export type AuditArea = keyof typeof AUDIT_AREAS;
export const AUDIT_AREA_KEYS = Object.keys(AUDIT_AREAS) as AuditArea[];

/** What kind of change an action is, for colouring it. */
export type AuditKind = 'create' | 'update' | 'delete' | 'access';

export function auditArea(action: string): AuditArea | null {
  const subject = action.split('.')[0]!;
  return AUDIT_AREA_KEYS.find((a) => (AUDIT_AREAS[a] as readonly string[]).includes(subject)) ?? null;
}

export function auditKind(action: string): AuditKind {
  const verb = action.split('.').slice(1).join('.');
  if (/delete|remove|reject|unpay|deactivate/.test(verb)) return 'delete';
  if (/view|export|download/.test(verb)) return 'access';
  if (/create|upload|generate|self_checkin/.test(verb)) return 'create';
  return 'update';
}

export type AuditLogDto = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  /** Changed fields: a value, or [before, after]. */
  diff: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string } | null;
};
