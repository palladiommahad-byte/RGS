'use client';

import * as Popover from '@radix-ui/react-popover';
import { todayIso, type NotificationDto, type NotificationListDto } from '@riad/shared';
import { ArrowDownLeft, ArrowUpRight, Bell, CalendarClock, CheckCheck, DatabaseBackup, DoorOpen, LogIn, QrCode, Wallet, type LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatMoney, timeAgo } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const LIMIT = 30;

const STYLE: Record<NotificationDto['type'], { icon: LucideIcon; className: string }> = {
  CHECKIN_REQUEST: { icon: QrCode, className: 'bg-amber-100 text-amber-800' },
  CHECKIN: { icon: LogIn, className: 'bg-emerald-100 text-emerald-800' },
  CHECKOUT: { icon: DoorOpen, className: 'bg-sky-100 text-sky-800' },
  CHECKOUT_SOON: { icon: CalendarClock, className: 'bg-violet-100 text-violet-800' },
  CASH: { icon: Wallet, className: 'bg-teal-100 text-teal-900' },
  BACKUP: { icon: DatabaseBackup, className: 'bg-red-100 text-red-800' },
};

/** The bell: check-ins, check-outs (and tomorrow's), cash box movements. Live. */
export function NotificationCenter({ buttonClassName, panelClassName }: { buttonClassName: string; panelClassName: string }) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useApiQuery<NotificationListDto>(`/notifications?limit=${LIMIT}${unreadOnly ? '&unread=true' : ''}`);
  useRealtimeEvent('notifications:changed', query.reload);
  const unread = query.data?.unread ?? 0;

  const markAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    query.reload();
  };
  const openItem = async (n: NotificationDto) => {
    setOpen(false);
    if (!n.read) void api(`/notifications/${n.id}/read`, { method: 'POST' }).then(() => query.reload());
    router.push(
      n.type === 'CASH' ? '/dashboard/expenses?tab=wallets' : n.type === 'BACKUP' ? '/dashboard/settings' : `/dashboard/stays/${n.data.stayId}`,
    );
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={buttonClassName} aria-label={unread ? t('labelUnread', { count: unread }) : t('title')}>
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] leading-5 font-semibold text-white ring-2 ring-background">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className={cn(panelClassName, 'flex max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden')}
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 pt-3 pb-2">
            <span className="text-base font-semibold">{t('title')}</span>
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={unread === 0}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
            >
              <CheckCheck className="size-4" aria-hidden />
              {t('markAllRead')}
            </button>
          </div>
          <div className="flex gap-1 px-3 pt-2" role="tablist">
            {[false, true].map((only) => (
              <button
                key={String(only)}
                type="button"
                role="tab"
                aria-selected={unreadOnly === only}
                onClick={() => setUnreadOnly(only)}
                className={cn(
                  'h-8 rounded-full px-3 text-sm font-medium transition-colors',
                  unreadOnly === only ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {only ? t('unread', { count: unread }) : t('all')}
              </button>
            ))}
          </div>
          <ul className="flex-1 overflow-y-auto overscroll-contain p-2">
            {query.data?.items.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                <Bell className="size-6 opacity-40" aria-hidden />
                {unreadOnly ? t('emptyUnread') : t('empty')}
              </li>
            )}
            {query.data?.items.map((n) => (
              <li key={n.id}>
                <NotificationRow n={n} onOpen={() => void openItem(n)} />
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function NotificationRow({ n, onOpen }: { n: NotificationDto; onOpen: () => void }) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const style = STYLE[n.type];
  const { title, body, tone } = describe(n, t, locale);

  return (
    <button type="button" onClick={onOpen} className={cn('flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-start transition-colors hover:bg-accent', !n.read && 'bg-primary/5')}>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', style.className)} aria-hidden>
        <style.icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-sm', n.read ? 'font-medium' : 'font-semibold')}>{title}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.createdAt, locale)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-sm text-foreground/80">
          {tone === 'in' && <ArrowDownLeft className="size-3.5 shrink-0 text-emerald-600" aria-hidden />}
          {tone === 'out' && <ArrowUpRight className="size-3.5 shrink-0 text-red-600 rtl:-scale-x-100" aria-hidden />}
          <span className="truncate">{body}</span>
        </span>
        {n.actor && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{t('by', { name: n.actor })}</span>}
      </span>
      {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label={t('new')} />}
    </button>
  );
}

type T = ReturnType<typeof useTranslations<'notifications'>>;

function describe(n: NotificationDto, t: T, locale: string): { title: string; body: string; tone?: 'in' | 'out' } {
  if (n.type === 'BACKUP') {
    const d = n.data;
    const last = d.lastOkAt ? t('backup.lastOk', { when: timeAgo(d.lastOkAt, locale) }) : t('backup.noneOk');
    return d.kind === 'FAILED'
      ? { title: t('backup.failed'), body: [d.error, last].filter(Boolean).join(' · ') }
      : { title: t('backup.stale'), body: last };
  }
  if (n.type === 'CASH') {
    const d = n.data;
    const amount = `${d.amount > 0 ? '+' : '−'}${formatMoney(Math.abs(d.amount), locale)}`;
    return {
      title: t(`cash.${d.kind}`, { wallet: d.walletName }),
      body: [amount, d.note, t('balance', { amount: formatMoney(d.balance, locale) })].filter(Boolean).join(' · '),
      tone: d.amount > 0 ? 'in' : 'out',
    };
  }
  const d = n.data;
  const room = d.roomName ?? t('noRoom');
  const who = d.guestName ? `${d.guestName} · ${room}` : room;
  switch (n.type) {
    case 'CHECKIN_REQUEST':
      // Room QR check-ins are automatic; one lands here only when that room was not free.
      return { title: d.roomNotFree ? t('checkinRoomNotFree', { room }) : t('checkinRequest'), body: d.guestName ?? room };
    case 'CHECKIN':
      return { title: t('checkin'), body: `${who} · ${t('nights', { count: d.nights })}` };
    case 'CHECKOUT':
      return {
        title: d.automatic ? t('checkoutAutomatic', { room }) : t('checkout', { room }),
        body: d.balance ? `${who} · ${t('balanceDue', { amount: formatMoney(d.balance, locale) })}` : `${who} · ${t('toClean')}`,
      };
    case 'CHECKOUT_SOON':
      return { title: d.checkOutDate <= todayIso() ? t('checkoutToday') : t('checkoutTomorrow'), body: who };
  }
}
