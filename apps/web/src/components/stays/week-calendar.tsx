'use client';

import { addDays, type IsoDate, type RoomDto, type StaySummaryDto } from '@riad/shared';
import { ChevronLeft, ChevronRight, Moon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { guestName, rowBars, weekStartOf, type Bar } from '@/components/calendar/layout';
import { HATCH, SOURCE_BADGE, STAY_BAR } from '@/components/calendar/styles';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export { weekStartOf };

const LANE = 40;
const NO_ROOM = 'none';

/**
 * Reception's week at a glance: one row per room, stays as bars from the middle of the
 * arrival day to the middle of the departure day (like the room calendar).
 */
export function WeekCalendar({
  weekStart,
  today,
  stays,
  rooms,
  onWeekChange,
  onOpenStay,
}: {
  weekStart: IsoDate;
  today: IsoDate;
  stays: StaySummaryDto[];
  rooms: RoomDto[];
  onWeekChange: (weekStart: IsoDate) => void;
  onOpenStay: (id: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const range = `${formatDate(days[0]!, locale, { day: 'numeric', month: 'short' })} – ${formatDate(days[6]!, locale, { day: 'numeric', month: 'short' })}`;

  // A QR check-in has only the room the guest asked for until reception confirms it.
  const roomIds = new Set(rooms.map((r) => r.id));
  const byRoom = new Map<string, StaySummaryDto[]>();
  for (const s of stays) {
    const id = s.room?.id ?? s.requestedRoom?.id;
    const key = id && roomIds.has(id) ? id : NO_ROOM;
    byRoom.set(key, [...(byRoom.get(key) ?? []), s]);
  }
  const rows: { id: string; name: string; type: string | null }[] = rooms.map((r) => ({ id: r.id, name: r.name, type: r.type }));
  if (byRoom.has(NO_ROOM)) rows.push({ id: NO_ROOM, name: t('today.noRoomRow'), type: null });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{range}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => onWeekChange(addDays(weekStart, -7))} aria-label={t('today.prevWeek')}>
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onWeekChange(weekStartOf(today))}>
            {t('today.thisWeek')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onWeekChange(addDays(weekStart, 7))} aria-label={t('today.nextWeek')}>
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px] overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[124px_minmax(0,1fr)] border-b bg-muted/40">
            <div className="flex items-end px-3 pb-2 text-xs font-medium text-muted-foreground">{t('calendar.rooms')}</div>
            <div className="grid grid-cols-7">
              {days.map((d) => (
                <div key={d} className={cn('flex flex-col items-center gap-0.5 border-s py-2', d === today && 'bg-teal-100/60')}>
                  <span className="text-[11px] font-medium text-muted-foreground uppercase">{formatDate(d, locale, { weekday: 'short' })}</span>
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
                      d === today ? 'bg-primary text-primary-foreground' : d < today ? 'text-muted-foreground' : '',
                    )}
                  >
                    {formatDate(d, locale, { day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {rows.map((row) => {
            const bars = rowBars(byRoom.get(row.id) ?? [], weekStart, 7);
            const lanes = Math.max(1, ...bars.map((b) => b.lane + 1));
            return (
              <div key={row.id} className="grid grid-cols-[124px_minmax(0,1fr)] border-b last:border-b-0">
                <div className="flex items-center px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{row.name}</span>
                    {row.type && <span className="block truncate text-[11px] text-muted-foreground">{row.type}</span>}
                  </span>
                </div>
                <div className="relative" style={{ height: lanes * LANE + 12 }}>
                  <div className="absolute inset-0 grid grid-cols-7">
                    {days.map((d) => (
                      <div key={d} className={cn('border-s', d === today && 'bg-teal-100/40')} style={d < today ? HATCH : undefined} />
                    ))}
                  </div>
                  {bars.map((b) => (
                    <WeekBar key={b.stay.id} bar={b} top={6 + b.lane * LANE} onOpen={onOpenStay} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Legend className="bg-teal-900" label={t('today.legendInHouse')} />
        <Legend className="bg-amber-200 ring-1 ring-amber-300" label={t('today.legendPending')} />
        <Legend className="bg-teal-100" label={t('today.legendCheckedOut')} />
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm border" style={HATCH} aria-hidden />
          {t('calendar.past')}
        </span>
      </div>
    </div>
  );
}

function WeekBar({ bar, top, onOpen }: { bar: Bar; top: number; onOpen: (id: string) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const s = bar.stay;
  const name = guestName(s, t('calendar.noGuestYet'));
  const width = bar.right - bar.left;
  const badge = SOURCE_BADGE[s.source];
  return (
    <button
      type="button"
      onClick={() => onOpen(s.id)}
      title={`${name} · ${formatDate(s.checkInDate, locale)} → ${formatDate(s.checkOutDate, locale)} · ${t('stays.nightsCount', { count: s.nights })}`}
      className={cn(
        // @container: short bars on narrow screens show the badge only, then the name.
        '@container absolute z-10 flex items-center gap-1.5 overflow-hidden px-1.5 text-start text-xs shadow-sm transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring',
        STAY_BAR[s.status],
        bar.cutStart ? 'rounded-s-none' : 'rounded-s-lg',
        bar.cutEnd ? 'rounded-e-none' : 'rounded-e-lg',
      )}
      style={{
        top,
        height: LANE - 6,
        insetInlineStart: `calc(${(bar.left / 7) * 100}% + 2px)`,
        width: `calc(${(width / 7) * 100}% - 4px)`,
      }}
    >
      {width >= 0.9 && (
        <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', badge.className)}>{badge.label}</span>
      )}
      <span className="min-w-0 flex-1 truncate font-semibold @max-[4.5rem]:hidden">{width >= 1.5 ? name : (s.mainGuest?.firstName ?? name)}</span>
      {width >= 1.5 && (
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums @max-[8rem]:hidden',
            s.status === 'CHECKED_IN' ? 'bg-white/20' : 'bg-black/10',
          )}
        >
          <Moon className="size-3" aria-hidden />
          {s.nights}
        </span>
      )}
    </button>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-sm', className)} aria-hidden />
      {label}
    </span>
  );
}
