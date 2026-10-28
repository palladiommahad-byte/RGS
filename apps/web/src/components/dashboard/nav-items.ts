import { PERMISSIONS as P, type Permission } from '@riad/shared';
import {
  BedDouble,
  BookUser,
  Briefcase,
  CalendarCheck,
  Landmark,
  LayoutDashboard,
  Receipt,
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
  /** Build phase in which the module is delivered. */
  phase: number;
  /** Pinned to the bottom of the sidebar (like Settings). */
  bottom?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { key: 'today', href: '/dashboard', icon: LayoutDashboard, anyOf: [P.STAYS_READ, P.ROOMS_READ], phase: 2 },
  { key: 'rooms', href: '/dashboard/rooms', icon: BedDouble, anyOf: [P.ROOMS_READ], phase: 2 },
  { key: 'stays', href: '/dashboard/stays', icon: CalendarCheck, anyOf: [P.STAYS_READ], phase: 2 },
  { key: 'guests', href: '/dashboard/guests', icon: BookUser, anyOf: [P.STAYS_READ], phase: 4 },
  {
    key: 'expenses',
    href: '/dashboard/expenses',
    icon: Receipt,
    anyOf: [P.EXPENSES_WRITE, P.EXPENSES_WRITE_PETTY_CASH, P.EXPENSES_READ_ALL],
    phase: 5,
  },
  { key: 'finance', href: '/dashboard/finance', icon: TrendingUp, anyOf: [P.FINANCE_REPORTS], phase: 6 },
  { key: 'taxes', href: '/dashboard/taxes', icon: Landmark, anyOf: [P.TAX_SETTINGS], phase: 6 },
  { key: 'hr', href: '/dashboard/hr', icon: Briefcase, anyOf: [P.HR_READ], phase: 7 },
  { key: 'users', href: '/dashboard/users', icon: UserCog, anyOf: [P.USERS_MANAGE], phase: 8 },
  { key: 'settings', href: '/dashboard/settings', icon: Settings, anyOf: [P.SETTINGS_RIAD], phase: 8, bottom: true },
];

export const SECTION_KEYS = NAV_ITEMS.filter((i) => i.href !== '/dashboard').map((i) => i.key);
