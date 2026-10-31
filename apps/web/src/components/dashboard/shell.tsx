'use client';

import { STAFF_LOCALES } from '@riad/shared';
import { ChevronsLeft, Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { BrandMark } from '@/components/brand-mark';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Button } from '@/components/ui/button';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, type NavItem } from './nav-items';
import { TopBarActions } from './top-bar';

const COLLAPSED_KEY = 'riad.sidebarCollapsed';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const { user, can } = useAuth();
  const [open, setOpen] = useState(false);
  // Computers: the sidebar can fold to icons only; the choice is remembered on this device.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // storage unavailable: keep it open
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
      } catch {
        // not remembered, still toggled
      }
      return !c;
    });
  };
  const c = collapsed;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const visible = NAV_ITEMS.filter((i) => can(...i.anyOf));
  const main = visible.filter((i) => !i.bottom);
  const bottom = visible.filter((i) => i.bottom);
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const navLink = (item: NavItem) => {
    const active = isActive(item.href);
    const label = t(`nav.${item.key}`);
    return (
      <li key={item.key}>
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          title={c ? label : undefined}
          className={cn(
            'flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors',
            c && 'md:justify-center md:px-0',
            active
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground/75 hover:bg-accent hover:text-foreground',
          )}
        >
          <item.icon className="size-5 shrink-0" aria-hidden />
          <span className={cn('truncate', c && 'md:sr-only')}>{label}</span>
        </Link>
      </li>
    );
  };

  return (
    <div className="min-h-dvh bg-background print:bg-white">
      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex w-64 flex-col border-e bg-card transition-[transform,width] print:hidden',
          c && 'md:w-[76px]',
          !open && 'max-md:ltr:-translate-x-full max-md:rtl:translate-x-full',
        )}
      >
        <Button
          variant="outline"
          size="icon"
          onClick={toggleCollapsed}
          aria-label={c ? t('common.expandMenu') : t('common.collapseMenu')}
          title={c ? t('common.expandMenu') : t('common.collapseMenu')}
          aria-expanded={!c}
          className="absolute -end-3.5 top-7 z-10 hidden size-7 rounded-full bg-card shadow-sm max-md:hidden md:flex"
        >
          <ChevronsLeft className={cn('size-4 transition-transform', c ? 'rotate-180 rtl:rotate-0' : 'rtl:rotate-180')} />
        </Button>
        <div className={cn('flex h-20 items-center justify-between gap-2 px-5', c && 'md:justify-center md:px-0 md:[&>span>span:last-child]:hidden')}>
          <BrandMark name={user.riad.name} logoVersion={user.riad.logoVersion} />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen(false)}
            aria-label={t('common.closeMenu')}
          >
            <X />
          </Button>
        </div>

        <nav className={cn('flex flex-1 flex-col overflow-y-auto px-4 pb-4', c && 'md:px-3')} aria-label={t('common.mainMenu')}>
          <ul className="flex flex-col gap-1">{main.map(navLink)}</ul>
          {bottom.length > 0 && <ul className="mt-auto flex flex-col gap-1 pt-4">{bottom.map(navLink)}</ul>}
        </nav>

        <div className={cn('border-t p-4', c && 'md:hidden')}>
          <LocaleSwitcher locales={STAFF_LOCALES} />
        </div>
      </aside>

      <div className={cn('transition-[padding] md:ps-64 print:ps-0', c && 'md:ps-[76px]')}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card px-4 md:h-[72px] md:border-transparent md:bg-background/85 md:px-8 md:backdrop-blur print:hidden">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label={t('common.openMenu')}>
            <Menu />
          </Button>
          <div className="min-w-0 md:hidden">
            <BrandMark name={user.riad.name} logoVersion={user.riad.logoVersion} />
          </div>
          <div className="ms-auto">
            <TopBarActions />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] p-4 md:px-8 md:pt-2 md:pb-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
