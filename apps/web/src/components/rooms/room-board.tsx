'use client';

import { nightsBetween, ROOM_STATUSES, todayIso, type RoomDto, type RoomStatus, type StaySummaryDto } from '@riad/shared';
import { BedDouble, Brush, DoorOpen, LogIn, Users, Wrench, type LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { HATCH, roomMark } from '@/components/calendar/styles';
import { useRouter } from '@/i18n/navigation';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { RoomStatusDialog } from './room-status-dialog';

const ICON: Record<RoomStatus, LucideIcon> = { FREE: DoorOpen, OCCUPIED: BedDouble, CLEANING: Brush, OUT_OF_SERVICE: Wrench };

const TILE: Record<RoomStatus, string> = {
  FREE: 'border-border bg-card hover:border-teal-300 hover:shadow-sm',
  OCCUPIED: 'border-transparent bg-gradient-to-br from-teal-900 to-teal-700 text-white hover:from-teal-700',
  CLEANING: 'border-amber-300 bg-amber-50 text-amber-950 hover:border-amber-400',
  OUT_OF_SERVICE: 'border-stone-200 bg-stone-50 text-stone-600',
};

const PILL: Record<RoomStatus, string> = {
  FREE: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  OCCUPIED: 'bg-white/15 text-white',
  CLEANING: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300',
  OUT_OF_SERVICE: 'bg-stone-200 text-stone-700',
};

const MARK: Record<RoomStatus, string> = {
  FREE: 'bg-teal-100 text-teal-900',
  OCCUPIED: 'bg-white/15 text-white',
  CLEANING: 'bg-amber-200/70 text-amber-950',
  OUT_OF_SERVICE: 'bg-stone-200 text-stone-600',
};

/**
 * Rooms by status, filterable. Tapping a room opens its stay (occupied) or changes its
 * status (housekeeping). Free rooms show today's expected arrival, if any.
 */
export function RoomBoard({
  rooms,
  inHouse,
  expected,
  onChanged,
}: {
  rooms: RoomDto[];
  inHouse?: StaySummaryDto[];
  /** Pending QR check-ins: free rooms show who is expected today. */
  expected?: StaySummaryDto[];
  onChanged: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { can } = useAuth();
  const [selected, setSelected] = useState<RoomDto | null>(null);
  const [filter, setFilter] = useState<RoomStatus | 'ALL'>('ALL');
  const today = todayIso();
  const stayByRoom = new Map((inHouse ?? []).filter((s) => s.room).map((s) => [s.room!.id, s]));
  const arrivalByRoom = new Map(
    (expected ?? [])
      .filter((s) => s.status === 'PENDING' && s.checkInDate === today)
      .map((s) => [(s.room ?? s.requestedRoom)?.id, s] as const)
      .filter((e): e is readonly [string, StaySummaryDto] => !!e[0]),
  );
  const counts = Object.fromEntries(ROOM_STATUSES.map((s) => [s, rooms.filter((r) => r.status === s).length])) as Record<RoomStatus, number>;
  const shown = filter === 'ALL' ? rooms : rooms.filter((r) => r.status === filter);

  function open(room: RoomDto) {
    const stay = stayByRoom.get(room.id);
    if (room.status === 'OCCUPIED' && stay && can('stays.read')) router.push(`/dashboard/stays/${stay.id}`);
    else if (can('rooms.status.update')) setSelected(room);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t('today.roomBoard')}>
        {(['ALL', ...ROOM_STATUSES] as const).map((s) => {
          if (s !== 'ALL' && counts[s] === 0 && filter !== s) return null;
          const active = filter === s;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(s)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {s === 'ALL' ? t('rooms.all') : t(`roomStatus.${s}`)}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white/20' : 'bg-muted')}>
                {s === 'ALL' ? rooms.length : counts[s]}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 2xl:grid-cols-4">
        {shown.map((room) => {
          const stay = stayByRoom.get(room.id);
          const arrival = arrivalByRoom.get(room.id);
          const Icon = ICON[room.status];
          const night = stay ? Math.min(stay.nights, Math.max(1, nightsBetween(stay.checkInDate, today) + 1)) : 0;
          const clickable = (room.status === 'OCCUPIED' && stay && can('stays.read')) || can('rooms.status.update');
          return (
            <li key={room.id}>
              <button
                type="button"
                onClick={() => open(room)}
                disabled={!clickable}
                className={cn(
                  'flex h-full min-h-32 w-full flex-col gap-3 rounded-2xl border p-3.5 text-start transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default',
                  TILE[room.status],
                )}
                style={room.status === 'OUT_OF_SERVICE' ? HATCH : undefined}
              >
                <span className="flex w-full items-start gap-3">
                  <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-semibold max-sm:hidden', MARK[room.status])} aria-hidden>
                    {roomMark(room.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{room.name}</span>
                    <span className="flex items-center gap-1.5 text-xs opacity-75">
                      <span className="truncate">{room.type}</span>
                      <span aria-hidden>·</span>
                      <Users className="size-3 shrink-0" aria-hidden />
                      {room.capacity}
                    </span>
                  </span>
                </span>
                <span className={cn('inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[11px] font-medium', PILL[room.status])}>
                  <Icon className="size-3" aria-hidden />
                  {t(`roomStatus.${room.status}`)}
                </span>

                <span className="mt-auto flex w-full flex-col gap-1.5">
                  {room.status === 'OCCUPIED' && stay ? (
                    <>
                      <span className="truncate text-sm font-semibold">
                        {stay.mainGuest ? `${stay.mainGuest.firstName} ${stay.mainGuest.lastName}` : '—'}
                      </span>
                      <span className="flex items-center justify-between gap-2 text-xs opacity-80">
                        <span>{t('today.until', { date: formatDate(stay.checkOutDate, locale, { day: 'numeric', month: 'short' }) })}</span>
                        <span className="tabular-nums">{t('rooms.nightOf', { night, total: stay.nights })}</span>
                      </span>
                      <span className="h-1.5 w-full overflow-hidden rounded-full bg-white/20" aria-hidden>
                        <span className="block h-full rounded-full bg-[#c5f27f]" style={{ width: `${(night / Math.max(1, stay.nights)) * 100}%` }} />
                      </span>
                    </>
                  ) : room.status === 'CLEANING' ? (
                    <span className="text-xs">{can('rooms.status.update') ? t('rooms.tapWhenClean') : t('rooms.toClean')}</span>
                  ) : room.status === 'FREE' ? (
                    arrival ? (
                      <span className="inline-flex items-center gap-1.5 truncate rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
                        <LogIn className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">
                          {t('rooms.arrivalToday', { name: arrival.mainGuest ? `${arrival.mainGuest.firstName} ${arrival.mainGuest.lastName}` : '—' })}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground tabular-nums">{t('calendar.perNight', { price: formatMoney(room.basePrice, locale) })}</span>
                    )
                  ) : (
                    <span className="text-xs">{t('rooms.outOfServiceHint')}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <RoomStatusDialog room={selected} onClose={() => setSelected(null)} onChanged={() => onChanged()} />
    </div>
  );
}
