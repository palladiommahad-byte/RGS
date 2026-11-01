import { PERMISSIONS as P, type Permission } from '@riad/shared';
import {
  Banknote,
  BedDouble,
  BookUser,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  Landmark,
  LayoutDashboard,
  Receipt,
  ScanLine,
  ScrollText,
  Settings,
  TrendingUp,
  UserCog,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  key: string;
  href: string;
  icon: LucideIcon;
  /** Shown when the user holds at least one of these. */
  anyOf: Permission[];
  /** Sidebar group (shown under a small title); Settings is pinned to the bottom instead. */
  section?: NavSection;
  /** Pinned to the bottom of the sidebar (like Settings). */
  bottom?: boolean;
};

export const NAV_SECTIONS = ['front', 'money', 'team'] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

export const NAV_ITEMS: NavItem[] = [
  { key: 'today', section: 'front', href: '/dashboard', icon: LayoutDashboard, anyOf: [P.STAYS_READ] },
  { key: 'rooms', section: 'front', href: '/dashboard/rooms', icon: BedDouble, anyOf: [P.ROOMS_READ] },
  { key: 'stays', section: 'front', href: '/dashboard/stays', icon: CalendarCheck, anyOf: [P.STAYS_READ] },
  { key: 'calendar', section: 'front', href: '/dashboard/calendar', icon: CalendarDays, anyOf: [P.STAYS_READ] },
  { key: 'guests', section: 'front', href: '/dashboard/guests', icon: BookUser, anyOf: [P.STAYS_READ] },
  {
    key: 'expenses', section: 'money',
    href: '/dashboard/expenses',
    icon: Receipt,
    anyOf: [P.EXPENSES_WRITE, P.EXPENSES_WRITE_PETTY_CASH, P.EXPENSES_READ_ALL],
  },
  { key: 'cashBox', section: 'money', href: '/dashboard/cash-box', icon: Wallet, anyOf: [P.EXPENSES_WRITE, P.EXPENSES_WRITE_PETTY_CASH] },
  { key: 'payments', section: 'money', href: '/dashboard/payments', icon: Banknote, anyOf: [P.FINANCE_REPORTS, P.PAYMENTS_WRITE] },
  { key: 'finance', section: 'money', href: '/dashboard/finance', icon: TrendingUp, anyOf: [P.FINANCE_REPORTS] },
  { key: 'taxes', section: 'money', href: '/dashboard/taxes', icon: Landmark, anyOf: [P.TAX_SETTINGS] },
  { key: 'hr', section: 'team', href: '/dashboard/hr', icon: Briefcase, anyOf: [P.HR_READ] },
  // Badge clock, opened on the reception tablet: reception, managers, owners.
  { key: 'clock', section: 'team', href: '/staff/clock', icon: ScanLine, anyOf: [P.STAYS_READ, P.HR_READ] },
  { key: 'users', section: 'team', href: '/dashboard/users', icon: UserCog, anyOf: [P.USERS_MANAGE] },
  { key: 'audit', section: 'team', href: '/dashboard/audit', icon: ScrollText, anyOf: [P.AUDIT_READ] },
  { key: 'settings', href: '/dashboard/settings', icon: Settings, anyOf: [P.SETTINGS_RIAD], bottom: true },
];
