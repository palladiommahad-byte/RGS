'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Segmented language switch. Keeps the query string (check-in links carry their token). */
export function LocaleSwitcher({
  locales,
  className,
  short,
}: {
  locales: readonly string[];
  className?: string;
  /** Show "FR", "EN"… instead of full names (narrow headers). */
  short?: boolean;
}) {
  const t = useTranslations();
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div
      className={cn('inline-flex rounded-lg bg-muted p-1', className)}
      role="group"
      aria-label={t('common.language')}
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => router.replace(`${pathname}${window.location.search}`, { locale: l })}
          aria-pressed={l === current}
          title={t(`localeNames.${l}`)}
          className={cn(
            'h-9 flex-1 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
            short && 'px-2.5',
            l === current && 'bg-card text-foreground shadow-xs',
          )}
          lang={l}
        >
          {short ? (l === 'ar' ? 'ع' : l.toUpperCase()) : t(`localeNames.${l}`)}
        </button>
      ))}
    </div>
  );
}
