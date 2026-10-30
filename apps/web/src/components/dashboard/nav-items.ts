import { PERMISSIONS as P, type Permission } from '@riad/shared';
import {
  BedDouble,
  BookUser,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  Landmark,
  LayoutDashboard,
  Receipt,
  ScanLine,
  Settings,
  TrendingUp,
  UserCog,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  key: string;
  href: string;
  icon: LucideIcon;
  /** Shown when the user holds at least one of these. */
  anyOf: Permission[];
  /** Pinned to the bottom of the sidebar (like Settings). */
  bottom?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { key: 'today', href: '/dashboard', icon: LayoutDashboard, anyOf: [P.STAYS_READ, P.ROOMS_READ] },
  { key: 'rooms', href: '/dashboard/rooms', icon: BedDouble, anyOf: [P.ROOMS_READ] },
  { key: 'stays', href: '/dashboard/stays', icon: CalendarCheck, anyOf: [P.STAYS_READ] },
  { key: 'calendar', href: '/dashboard/calendar', icon: CalendarDays, anyOf: [P.STAYS_READ] },
  { key: 'guests', href: '/dashboard/guests', icon: BookUser, anyOf: [P.STAYS_READ] },
  {
    key: 'expenses',
    href: '/dashboard/expenses',
    icon: Receipt,
    anyOf: [P.EXPENSES_WRITE, P.EXPENSES_WRITE_PETTY_CASH, P.EXPENSES_READ_ALL],
  },
  { key: 'finance', href: '/dashboard/finance', icon: TrendingUp, anyOf: [P.FINANCE_REPORTS] },
  { key: 'taxes', href: '/dashboard/taxes', icon: Landmark, anyOf: [P.TAX_SETTINGS] },
  { key: 'hr', href: '/dashboard/hr', icon: Briefcase, anyOf: [P.HR_READ] },
  // Badge clock for the reception tablet: any signed-in staff.
  { key: 'clock', href: '/staff/clock', icon: ScanLine, anyOf: [] },
  { key: 'users', href: '/dashboard/users', icon: UserCog, anyOf: [P.USERS_MANAGE] },
  { key: 'settings', href: '/dashboard/settings', icon: Settings, anyOf: [P.SETTINGS_RIAD], bottom: true },
];
