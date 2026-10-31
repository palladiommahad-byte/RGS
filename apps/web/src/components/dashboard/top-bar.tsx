'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { roleLabel } from '@riad/shared';
import { ChevronDown, KeyRound, LogOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ChangePasswordDialog } from '@/components/change-password-dialog';
import { cn } from '@/lib/utils';
import { NotificationCenter } from './notification-center';

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

const panel =
  'z-50 rounded-2xl border bg-popover text-popover-foreground shadow-lg outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95';
const roundButton =
  'relative flex size-11 items-center justify-center rounded-full bg-muted/70 text-foreground/80 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent';

/** Top-right of every staff page: the notification center and the account menu. */
export function TopBarActions() {
  const { can } = useAuth();
  return (
    <div className="flex items-center gap-2">
      {can('stays.read', 'rooms.read', 'expenses.read_all', 'expenses.write_petty_cash') && (
        <NotificationCenter buttonClassName={roundButton} panelClassName={panel} />
      )}
      <UserMenu />
    </div>
  );
}

function UserMenu() {
  const t = useTranslations();
  const locale = useLocale();
  const { user, logout } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const roleName = roleLabel(user.role, locale);
  const item =
    'flex h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px] outline-none select-none data-[highlighted]:bg-accent';

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className="flex items-center gap-2 rounded-full p-0.5 pe-2 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent"
          aria-label={t('common.account')}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground ring-2 ring-background">
            {initials(user.name)}
          </span>
          <span className="hidden min-w-0 text-start leading-tight lg:block">
            <span className="block max-w-40 truncate text-sm font-medium">{user.name}</span>
            <span className="block text-xs text-muted-foreground">{roleName}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted-foreground lg:block" aria-hidden />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} collisionPadding={12} className={cn(panel, 'w-64 p-1.5')}>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>
                {initials(user.name)}
              </span>
              <div className="min-w-0 leading-tight">
                <div className="truncate font-medium">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                <div className="mt-1 inline-block rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-900">{roleName}</div>
              </div>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item className={item} onSelect={() => setChangingPassword(true)}>
              <KeyRound className="size-4 text-muted-foreground" aria-hidden />
              {t('account.changePassword')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={cn(item, 'text-destructive data-[highlighted]:bg-red-50')} onSelect={() => void logout()}>
              <LogOut className="size-4 rtl:rotate-180" aria-hidden />
              {t('common.logout')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
    </>
  );
}
