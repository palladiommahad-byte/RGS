'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { STAFF_LOCALES } from '@riad/shared';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const panel =
  'z-50 rounded-2xl border bg-popover text-popover-foreground shadow-lg outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95';
const roundButton =
  'relative flex size-11 items-center justify-center rounded-full bg-muted/70 text-foreground/80 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent';

/** Compact language picker (globe + code, list on click). Keeps the page and its query string. */
export function LanguageMenu({
  locales = STAFF_LOCALES,
  className,
}: {
  locales?: readonly string[];
  /** Extra classes for the button (e.g. a border on plain pages). */
  className?: string;
}) {
  const t = useTranslations();
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const short = (l: string) => (l === 'ar' ? 'ع' : l.toUpperCase());

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(roundButton, 'gap-1.5 sm:w-auto sm:px-3.5', className)}
        aria-label={`${t('common.language')}: ${t(`localeNames.${current}`)}`}
        title={t('common.language')}
      >
        <Globe className="hidden size-[18px] sm:block" aria-hidden />
        <span className="text-sm font-semibold" lang={current}>
          {short(current)}
        </span>
        <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} collisionPadding={12} className={cn(panel, 'w-48 p-1.5')}>
          <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {t('common.language')}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={current}
            onValueChange={(l) => router.replace(`${pathname}${window.location.search}`, { locale: l })}
          >
            {locales.map((l) => (
              <DropdownMenu.RadioItem
                key={l}
                value={l}
                lang={l}
                className="flex h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px] outline-none select-none data-[highlighted]:bg-accent data-[state=checked]:font-semibold data-[state=checked]:text-primary"
              >
                <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-foreground/80">{short(l)}</span>
                <span className="flex-1">{t(`localeNames.${l}`)}</span>
                <DropdownMenu.ItemIndicator>
                  <Check className="size-4" aria-hidden />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
