'use client';

import { useLocale } from 'next-intl';
import { useLayoutEffect } from 'react';
import { reapplyStoredTheme } from '@/lib/theme';

/**
 * Switching language re-renders <html> and drops the theme set by the boot script, so the
 * page fell back to the default colours. This puts the remembered theme back before the
 * browser paints, on first load and after every language change.
 */
export function ThemeKeeper() {
  const locale = useLocale();
  useLayoutEffect(() => {
    reapplyStoredTheme();
  }, [locale]);
  return null;
}
