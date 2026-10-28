'use client';

import type { RoomDto, StaySummaryDto } from '@riad/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ROOM_DOT, ROOM_TILE } from '@/components/status-badges';
import { useRouter } from '@/i18n/navigation';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { RoomStatusDialog } from './room-status-dialog';

/**
 * Grid of rooms by status. Tapping a room changes its status (housekeeping) or, for an
 * occupied room, opens the stay (reception).
 */
export function RoomBoard({
  rooms,
  inHouse,
  onChanged,
}: {
  rooms: RoomDto[];
  inHouse?: StaySummaryDto[];
  onChanged: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { can } = useAuth();
  const [selected, setSelected] = useState<RoomDto | null>(null);
  const stayByRoom = new Map((inHouse ?? []).filter((s) => s.room).map((s) => [s.room!.id, s]));

  function open(room: RoomDto) {
    const stay = stayByRoom.get(room.id);
    if (room.status === 'OCCUPIED' && stay && can('stays.read')) {
      router.push(`/dashboard/stays/${stay.id}`);
    } else if (can('rooms.status.update')) {
      setSelected(room);
    }
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
        {rooms.map((room) => {
          const stay = stayByRoom.get(room.id);
          return (
            <li key={room.id}>
              <button
                type="button"
                onClick={() => open(room)}
                className={cn(
                  'flex min-h-24 w-full flex-col items-start gap-1 rounded-xl border p-3.5 text-start transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  ROOM_TILE[room.status],
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate font-semibold">{room.name}</span>
                  <span className={cn('size-2.5 shrink-0 rounded-full', ROOM_DOT[room.status])} aria-hidden />
                </span>
                <span className="text-xs opacity-75">{t(`roomStatus.${room.status}`)}</span>
                {stay?.mainGuest && (
                  <span className="mt-auto line-clamp-1 text-sm font-medium">
                    {stay.mainGuest.firstName} {stay.mainGuest.lastName}
                  </span>
                )}
                {stay && (
                  <span className="text-xs opacity-75">
                    {t('today.until', {
                      date: formatDate(stay.checkOutDate, locale, { day: 'numeric', month: 'short' }),
                    })}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <RoomStatusDialog room={selected} onClose={() => setSelected(null)} onChanged={() => onChanged()} />
    </>
  );
}
