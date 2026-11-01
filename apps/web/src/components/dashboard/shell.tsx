'use client';

import { STAFF_LOCALES } from '@riad/shared';
import { ChevronsLeft, Menu, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { BrandMark } from '@/components/brand-mark';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Button } from '@/components/ui/button';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, NAV_SECTIONS, type NavItem } from './nav-items';
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
            'flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
            c && 'lg:justify-center lg:px-0',
            active
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-foreground/75 hover:bg-accent hover:text-foreground',
          )}
        >
          <item.icon className="size-5 shrink-0" aria-hidden />
          <span className={cn('truncate', c && 'lg:sr-only')}>{label}</span>
        </Link>
      </li>
    );
  };

  return (
    <div className="min-h-dvh bg-background print:bg-white">
      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex w-64 flex-col border-e bg-card transition-[transform,width] print:hidden',
          c && 'lg:w-[76px]',
          !open && 'max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full',
        )}
      >
        <Button
          variant="outline"
          size="icon"
          onClick={toggleCollapsed}
          aria-label={c ? t('common.expandMenu') : t('common.collapseMenu')}
          title={c ? t('common.expandMenu') : t('common.collapseMenu')}
          aria-expanded={!c}
          className="absolute -end-3.5 top-7 z-10 hidden size-7 rounded-full bg-card shadow-sm max-lg:hidden lg:flex"
        >
          <ChevronsLeft className={cn('size-4 transition-transform', c ? 'rotate-180 rtl:rotate-0' : 'rtl:rotate-180')} />
        </Button>
        <div className={cn('flex h-20 items-center justify-between gap-2 px-5', c && 'lg:justify-center lg:px-0 lg:[&>span>span:last-child]:hidden')}>
          <BrandMark name={user.riad.name} logoVersion={user.riad.logoVersion} />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(false)}
            aria-label={t('common.closeMenu')}
          >
            <X />
          </Button>
        </div>

        <nav className={cn('flex flex-1 flex-col overflow-y-auto px-4 pb-4', c && 'lg:px-3')} aria-label={t('common.mainMenu')}>
          {NAV_SECTIONS.map((section) => {
            const items = main.filter((i) => i.section === section);
            if (!items.length) return null;
            return (
              <div key={section} className="flex flex-col gap-1 pt-4 first:pt-1">
                <span className={cn('px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase', c && 'lg:sr-only')}>
                  {t(`navSection.${section}`)}
                </span>
                {c && <span className="mx-3 mb-1 hidden border-t lg:block" aria-hidden />}
                <ul className="flex flex-col gap-0.5">{items.map(navLink)}</ul>
              </div>
            );
          })}
          {bottom.length > 0 && <ul className="mt-auto flex flex-col gap-1 pt-4">{bottom.map(navLink)}</ul>}
        </nav>

        <div className={cn('border-t p-4', c && 'lg:hidden')}>
          <LocaleSwitcher locales={STAFF_LOCALES} />
        </div>
      </aside>

      <div className={cn('transition-[padding] lg:ps-64 print:ps-0', c && 'lg:ps-[76px]')}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card px-4 lg:h-[72px] lg:border-transparent lg:bg-background/85 lg:px-8 lg:backdrop-blur print:hidden">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label={t('common.openMenu')}>
            <Menu />
          </Button>
          <div className="min-w-0 lg:hidden">
            <BrandMark name={user.riad.name} logoVersion={user.riad.logoVersion} />
          </div>
          {can('stays.read') && <TopSearch />}
          <div className="ms-auto">
            <TopBarActions />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] p-4 md:px-8 md:pt-2 md:pb-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}

/** Top-bar search (tablets and computers): finds stays by guest name or booking reference. */
function TopSearch() {
  const t = useTranslations();
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className="relative hidden w-full max-w-sm md:block"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `/dashboard/stays?q=${encodeURIComponent(term)}` : '/dashboard/stays');
      }}
    >
      <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('common.searchStays')}
        aria-label={t('common.searchStays')}
        className="h-11 w-full rounded-xl border bg-card ps-10 pe-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
      />
    </form>
  );
}
