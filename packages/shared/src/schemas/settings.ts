import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const INVOICE_PREFIX = /^[A-Z0-9-]{1,12}$/;
/** Moroccan ICE: 15 digits. */
export const ICE = /^\d{15}$/;

export const riadSettingsFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: optionalText(200),
  city: optionalText(80),
  phone: optionalText(40),
  email: optionalText(120).refine((v) => !v || z.string().email().safeParse(v).success, 'invalid_email'),
  invoicePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => INVOICE_PREFIX.test(v), 'invalid_prefix'),
  ice: optionalText(15).refine((v) => !v || ICE.test(v), 'invalid_ice'),
  fiscalId: optionalText(20),
  rcNumber: optionalText(30),
  patente: optionalText(20),
  wifiInfo: optionalText(300),
});
export type RiadSettingsFormInput = z.infer<typeof riadSettingsFormSchema>;

export type RiadSettingsDto = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  invoicePrefix: string;
  ice: string | null;
  fiscalId: string | null;
  rcNumber: string | null;
  patente: string | null;
  wifiInfo: string | null;
  /** Changes with every upload; null = no logo. */
  logoVersion: string | null;
  /** What the next invoice will be numbered. */
  nextInvoiceNumber: string;
};

export const PASSWORD_MIN = 8;
const password = z.string().min(PASSWORD_MIN, 'password_too_short').max(128);

export const userFormSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email('invalid_email'),
  roleId: z.string().uuid('required'),
});

export const newUserFormSchema = userFormSchema.extend({ password });

export const resetPasswordSchema = z.object({ password });

export const changePasswordSchema = z
  .object({ current: z.string().min(1), next: password, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: 'password_mismatch', path: ['confirm'] });

type RoleRef = { id: string; key: string; nameFr: string; nameAr: string };

export type UserDto = {
  id: string;
  name: string;
  email: string;
  role: RoleRef;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  isSelf: boolean;
  /** The current user may edit this account (its permissions are a subset of theirs). */
  manageable: boolean;
};

export type RoleDto = RoleRef & {
  permissions: string[];
  userCount: number;
  /** The current user may give this role (no privilege escalation). */
  assignable: boolean;
};
