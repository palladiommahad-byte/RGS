import { PUBLIC_LOCALES, RTL_LOCALES, STAFF_LOCALES } from '@riad/shared';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: PUBLIC_LOCALES,
  defaultLocale: 'fr',
});

export const isStaffLocale = (l: string): boolean => (STAFF_LOCALES as readonly string[]).includes(l);
export const isRtl = (l: string): boolean => (RTL_LOCALES as readonly string[]).includes(l);
