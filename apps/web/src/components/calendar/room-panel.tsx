'use client';

import type { RoomDto } from '@riad/shared';
import { BedDouble, ChevronLeft, Search, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ROOM_DOT } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { roomMark } from './styles';

/** Left column of the calendar: the rooms, searchable; the selected one is outlined. */
export function RoomPanel({
  rooms,
  selectedId,
  onSelect,
  onCollapse,
}: {
  rooms: RoomDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCollapse?: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const shown = q ? rooms.filter((r) => `${r.name} ${r.type}`.toLowerCase().includes(q)) : rooms;

  return (
    <aside className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <h2 className="flex items-center gap-2 font-semibold">
          <BedDouble className="size-5 text-teal-700" aria-hidden />
          {t('calendar.rooms')}
        </h2>
        {onCollapse && (
          <Button variant="ghost" size="icon" onClick={onCollapse} aria-label={t('calendar.hideRooms')} title={t('calendar.hideRooms')}>
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Button>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('calendar.searchRooms')} aria-label={t('calendar.searchRooms')} className="ps-9" />
      </div>
      <ul className="flex flex-col gap-2 overflow-y-auto" role="listbox" aria-label={t('calendar.rooms')}>
        {shown.map((r) => {
          const selected = r.id === selectedId;
          return (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(r.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-2.5 text-start transition-colors',
                  selected ? 'border-teal-700 bg-teal-100/50 ring-1 ring-teal-700' : 'bg-card hover:bg-accent',
                )}
              >
                <span
                  className={cn(
                    'flex size-12 shrink-0 items-center justify-center rounded-lg text-lg font-semibold',
                    selected ? 'bg-primary text-primary-foreground' : 'bg-teal-100 text-teal-900',
                  )}
                  aria-hidden
                >
                  {roomMark(r.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.name}</span>
                    <span className={cn('size-2 shrink-0 rounded-full', ROOM_DOT[r.status])} title={t(`roomStatus.${r.status}`)} />
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{r.type}</span>
                  <span className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden />
                      {r.capacity}
                    </span>
                    <span className="tabular-nums">{t('calendar.perNight', { price: formatMoney(r.basePrice, locale) })}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2 py-4 text-center text-sm text-muted-foreground">{t('calendar.noRooms')}</li>}
      </ul>
    </aside>
  );
}
