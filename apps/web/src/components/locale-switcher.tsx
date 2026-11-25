'use client';

import { useLocale, useTranslations } from 'next-intl';
import { LocaleFlag } from '@/components/locale-flag';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Segmented language switch. Keeps the query string (check-in links carry their token). */
export function LocaleSwitcher({
  locales,
  className,
  short,
  flags,
}: {
  locales: readonly string[];
  className?: string;
  /** Show "FR", "EN"… instead of full names (narrow headers). */
  short?: boolean;
  /** Round flag buttons (guest check-in). */
  flags?: boolean;
}) {
  const t = useTranslations();
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const go = (l: string) => router.replace(`${pathname}${window.location.search}`, { locale: l });

  if (flags) {
    return (
      <div className={cn('inline-flex items-center gap-1.5', className)} role="group" aria-label={t('common.language')}>
        {locales.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => go(l)}
            aria-pressed={l === current}
            aria-label={t(`localeNames.${l}`)}
            title={t(`localeNames.${l}`)}
            lang={l}
            className={cn(
              'rounded-full p-0.5 ring-2 transition',
              l === current ? 'ring-primary' : 'opacity-60 ring-transparent hover:opacity-100',
            )}
          >
            <LocaleFlag locale={l} className="block size-8" />
          </button>
        ))}
      </div>
    );
  }

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
          onClick={() => go(l)}
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
