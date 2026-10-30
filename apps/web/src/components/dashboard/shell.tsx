'use client';

import { roleLabel, STAFF_LOCALES } from '@riad/shared';
import { KeyRound, LogOut, Menu, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { BrandMark } from '@/components/brand-mark';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Button } from '@/components/ui/button';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { ChangePasswordDialog } from '@/components/change-password-dialog';
import { NAV_ITEMS, type NavItem } from './nav-items';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const visible = NAV_ITEMS.filter((i) => can(...i.anyOf));
  const main = visible.filter((i) => !i.bottom);
  const bottom = visible.filter((i) => i.bottom);
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const roleName = roleLabel(user.role, locale);

  const navLink = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <li key={item.key}>
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors',
            active
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground/75 hover:bg-accent hover:text-foreground',
          )}
        >
          <item.icon className="size-5 shrink-0" aria-hidden />
          {t(`nav.${item.key}`)}
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
          'fixed inset-y-0 start-0 z-40 flex w-64 flex-col border-e bg-card transition-transform print:hidden',
          !open && 'max-md:ltr:-translate-x-full max-md:rtl:translate-x-full',
        )}
      >
        <div className="flex h-20 items-center justify-between gap-2 px-5">
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

        <nav className="flex flex-1 flex-col overflow-y-auto px-4 pb-4" aria-label={t('common.mainMenu')}>
          <ul className="flex flex-col gap-1">{main.map(navLink)}</ul>
          {bottom.length > 0 && <ul className="mt-auto flex flex-col gap-1 pt-4">{bottom.map(navLink)}</ul>}
        </nav>

        <div className="flex flex-col gap-3 border-t p-4">
          <LocaleSwitcher locales={STAFF_LOCALES} />
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900"
              aria-hidden
            >
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground">{roleName}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setChangingPassword(true)} aria-label={t('account.changePassword')} title={t('account.changePassword')}>
              <KeyRound />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => void logout()} aria-label={t('common.logout')} title={t('common.logout')}>
              <LogOut className="rtl:rotate-180" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="md:ps-64 print:ps-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card px-4 md:hidden print:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t('common.openMenu')}>
            <Menu />
          </Button>
          <BrandMark name={user.riad.name} logoVersion={user.riad.logoVersion} />
        </header>
        <main className="mx-auto w-full max-w-[1440px] p-4 md:p-8 print:p-0">{children}</main>
      </div>
      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
    </div>
  );
}
