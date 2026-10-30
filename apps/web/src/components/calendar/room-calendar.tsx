'use client';

import {
  addDays,
  addMonths,
  monthStartOf,
  nightsBetween,
  todayIso,
  type IsoDate,
  type RoomDto,
  type StaySource,
  type StayStatus,
  type StaySummaryDto,
} from '@riad/shared';
import { Brush, CalendarDays, ChevronLeft, ChevronRight, LogIn, LogOut, Moon, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { weekStartOf } from '@/components/stays/week-calendar';
import { StayStatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { formatDate, formatMoney, intlLocale } from '@/lib/format';
import { cn } from '@/lib/utils';

export type CalendarView = 'month' | 'week' | 'day';

/** First and last-exclusive days the view shows, for fetching its stays. */
export function viewRange(view: CalendarView, cursor: IsoDate): { from: IsoDate; to: IsoDate } {
  if (view === 'day') return { from: addDays(cursor, -1), to: addDays(cursor, 1) };
  if (view === 'week') return { from: weekStartOf(cursor), to: addDays(weekStartOf(cursor), 7) };
  const first = monthStartOf(cursor);
  const from = weekStartOf(first);
  const lastDay = addDays(addMonths(first, 1), -1);
  return { from, to: addDays(weekStartOf(lastDay), 7) };
}

export function shiftCursor(view: CalendarView, cursor: IsoDate, step: 1 | -1): IsoDate {
  if (view === 'day') return addDays(cursor, step);
  if (view === 'week') return addDays(cursor, 7 * step);
  return addMonths(cursor, step);
}

const BAR: Record<StayStatus, string> = {
  CHECKED_IN: 'bg-gradient-to-r from-teal-900 to-teal-700 text-white rtl:bg-gradient-to-l',
  PENDING: 'bg-gradient-to-r from-amber-200 to-amber-100 text-amber-950 ring-1 ring-amber-300 rtl:bg-gradient-to-l',
  CHECKED_OUT: 'bg-gradient-to-r from-teal-100 to-teal-100/60 text-teal-900 rtl:bg-gradient-to-l',
  CANCELLED: 'hidden',
};

/** Neutral initials per booking channel (no third-party logos). */
const SOURCE_BADGE: Record<StaySource, { label: string; className: string }> = {
  BOOKING: { label: 'B', className: 'bg-[#1d4f91] text-white' },
  AIRBNB: { label: 'A', className: 'bg-[#e0565b] text-white' },
  EXPEDIA: { label: 'E', className: 'bg-[#f5c518] text-black' },
  DIRECT: { label: 'D', className: 'bg-white text-teal-900' },
  WALK_IN: { label: 'W', className: 'bg-white text-teal-900' },
  OTHER: { label: '•', className: 'bg-white text-teal-900' },
};

const HATCH: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 7px)',
};

type Bar = { stay: StaySummaryDto; left: number; right: number; lane: number; cutStart: boolean; cutEnd: boolean };

/**
 * Bars for one row of `days` columns starting at `rowStart`, hotel style: from the middle
 * of the arrival day to the middle of the departure day, so a departure and an arrival
 * share a day without overlapping. Overlaps go to the next lane.
 */
function rowBars(stays: StaySummaryDto[], rowStart: IsoDate, days: number): Bar[] {
  const bars = stays
    .filter((s) => s.status !== 'CANCELLED')
    .map((stay) => {
      const inIdx = nightsBetween(rowStart, stay.checkInDate);
      const outIdx = nightsBetween(rowStart, stay.checkOutDate);
      return {
        stay,
        left: inIdx < 0 ? 0 : inIdx + 0.5,
        right: outIdx >= days ? days : outIdx + 0.5,
        lane: 0,
        cutStart: inIdx < 0,
        cutEnd: outIdx >= days,
      };
    })
    .filter((b) => b.right > 0 && b.left < days && b.right > b.left)
    .sort((a, b) => a.left - b.left || b.right - a.right);
  const laneEnds: number[] = [];
  for (const b of bars) {
    let lane = laneEnds.findIndex((end) => end <= b.left);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = b.right;
    b.lane = lane;
  }
  return bars;
}

const guestName = (s: StaySummaryDto, fallback: string) =>
  s.mainGuest ? `${s.mainGuest.firstName} ${s.mainGuest.lastName}`.trim() : fallback;

/** True if someone sleeps in the room on the night of `day`. */
const occupied = (stays: StaySummaryDto[], day: IsoDate) =>
  stays.some((s) => s.status !== 'CANCELLED' && s.checkInDate <= day && day < s.checkOutDate);
const departing = (stays: StaySummaryDto[], day: IsoDate) =>
  stays.some((s) => (s.status === 'CHECKED_IN' || s.status === 'CHECKED_OUT') && s.checkOutDate === day);

export function RoomCalendar({
  room,
  stays,
  view,
  cursor,
  canCreate,
  onViewChange,
  onCursorChange,
  onOpenStay,
  onNewStay,
}: {
  room: RoomDto;
  stays: StaySummaryDto[];
  view: CalendarView;
  cursor: IsoDate;
  canCreate: boolean;
  onViewChange: (v: CalendarView) => void;
  onCursorChange: (d: IsoDate) => void;
  onOpenStay: (id: string) => void;
  onNewStay: (checkIn: IsoDate) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const today = todayIso();
  const fmt = (iso: IsoDate, o: Intl.DateTimeFormatOptions) => formatDate(iso, locale, o);

  const title =
    view === 'month'
      ? fmt(cursor, { month: 'long', year: 'numeric' })
      : view === 'week'
        ? `${fmt(weekStartOf(cursor), { day: 'numeric', month: 'short' })} – ${fmt(addDays(weekStartOf(cursor), 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
        : fmt(cursor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-5 text-teal-700" aria-hidden />
          <h2 className="text-lg font-semibold capitalize">{title}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-9" onClick={() => onCursorChange(shiftCursor(view, cursor, -1))} aria-label={t('calendar.previous')}>
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Button>
          <Button variant="outline" size="icon" className="size-9" onClick={() => onCursorChange(shiftCursor(view, cursor, 1))} aria-label={t('calendar.next')}>
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onCursorChange(today)}>
            {t('calendar.today')}
          </Button>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-1" role="tablist" aria-label={t('calendar.view')}>
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => onViewChange(v)}
                className={cn(
                  'h-8 rounded-md px-3 text-sm font-medium transition-colors',
                  view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`calendar.views.${v}`)}
              </button>
            ))}
          </div>
          {canCreate && (
            <Button size="sm" onClick={() => onNewStay(cursor < today ? today : cursor)}>
              <Plus aria-hidden />
              <span className="max-sm:sr-only">{t('stays.new')}</span>
            </Button>
          )}
        </div>
      </header>

      {view === 'day' ? (
        <DayView room={room} stays={stays} day={cursor} canCreate={canCreate} onOpenStay={onOpenStay} onNewStay={onNewStay} />
      ) : (
        <div className="overflow-x-auto">
          <div className={cn(view === 'month' ? 'min-w-[630px]' : 'min-w-[560px]')}>
            <Weekdays start={weekStartOf(cursor)} />
            <div className="overflow-hidden rounded-lg border">
              {weekRows(view, cursor).map((rowStart) => (
                <WeekRow
                  key={rowStart}
                  rowStart={rowStart}
                  month={view === 'month' ? cursor.slice(0, 7) : null}
                  tall={view === 'week'}
                  room={room}
                  stays={stays}
                  today={today}
                  canCreate={canCreate}
                  onOpenStay={onOpenStay}
                  onNewStay={onNewStay}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <Legend />
    </section>
  );
}

function weekRows(view: CalendarView, cursor: IsoDate): IsoDate[] {
  const { from, to } = viewRange(view, cursor);
  const rows: IsoDate[] = [];
  for (let d = from; d < to; d = addDays(d, 7)) rows.push(d);
  return rows;
}

function Weekdays({ start }: { start: IsoDate }) {
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' });
  return (
    <div className="grid grid-cols-7 pb-2 text-center text-xs font-medium text-muted-foreground uppercase">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i}>{fmt.format(new Date(`${addDays(start, i)}T00:00:00Z`))}</div>
      ))}
    </div>
  );
}

function WeekRow({
  rowStart,
  month,
  tall,
  room,
  stays,
  today,
  canCreate,
  onOpenStay,
  onNewStay,
}: {
  rowStart: IsoDate;
  /** "YYYY-MM" in month view: days of other months are dimmed. */
  month: string | null;
  tall: boolean;
  room: RoomDto;
  stays: StaySummaryDto[];
  today: IsoDate;
  canCreate: boolean;
  onOpenStay: (id: string) => void;
  onNewStay: (checkIn: IsoDate) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const bars = rowBars(stays, rowStart, 7);
  const lanes = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);
  const LANE = tall ? 64 : 46;
  const height = Math.max(tall ? 220 : 104, 34 + lanes * LANE + 28);

  return (
    <div className="relative border-b last:border-b-0" style={{ height }}>
      <div className="absolute inset-0 grid grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => {
          const day = addDays(rowStart, i);
          const past = day < today;
          const isToday = day === today;
          const otherMonth = month !== null && day.slice(0, 7) !== month;
          const free = !occupied(stays, day);
          const bookable = canCreate && free && !past;
          const Cell = bookable ? 'button' : 'div';
          return (
            <Cell
              key={day}
              type={bookable ? 'button' : undefined}
              onClick={bookable ? () => onNewStay(day) : undefined}
              aria-label={bookable ? t('calendar.newStayOn', { date: formatDate(day, locale) }) : undefined}
              className={cn(
                'relative flex flex-col border-e p-1.5 text-start last:border-e-0',
                otherMonth && 'bg-muted/40',
                isToday && 'bg-teal-100/40',
                bookable && 'hover:bg-accent focus-visible:z-10',
              )}
              style={past ? HATCH : undefined}
            >
              <span className="flex items-start justify-between gap-1">
                {departing(stays, day) && !past ? (
                  <span className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Brush className="size-3" aria-hidden />
                    {t('calendar.cleaning')}
                  </span>
                ) : (
                  <span />
                )}
                <span
                  className={cn(
                    'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums',
                    isToday ? 'bg-primary text-primary-foreground' : otherMonth ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {day.endsWith('-01') && !isToday ? formatDate(day, locale, { day: 'numeric', month: 'short' }) : Number(day.slice(8))}
                </span>
              </span>
              {free && !past && (
                <span className="mt-auto text-center text-[11px] text-muted-foreground tabular-nums">{formatMoney(room.basePrice, locale)}</span>
              )}
            </Cell>
          );
        })}
      </div>

      {bars.map((b) => (
        <StayBar key={`${b.stay.id}-${rowStart}`} bar={b} top={34 + b.lane * LANE} height={LANE - 6} tall={tall} onOpen={onOpenStay} />
      ))}
    </div>
  );
}

function StayBar({ bar, top, height, tall, onOpen }: { bar: Bar; top: number; height: number; tall: boolean; onOpen: (id: string) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const s = bar.stay;
  const name = guestName(s, t('calendar.noGuestYet'));
  const badge = SOURCE_BADGE[s.source];
  const wide = bar.right - bar.left >= 2;
  return (
    <button
      type="button"
      onClick={() => onOpen(s.id)}
      title={`${name} · ${formatDate(s.checkInDate, locale)} → ${formatDate(s.checkOutDate, locale)}`}
      className={cn(
        'absolute z-10 flex items-center gap-2 overflow-hidden px-2 text-start shadow-sm transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring',
        BAR[s.status],
        bar.cutStart ? 'rounded-s-none' : 'rounded-s-xl',
        bar.cutEnd ? 'rounded-e-none' : 'rounded-e-xl',
      )}
      style={{
        top,
        height,
        insetInlineStart: `calc(${(bar.left / 7) * 100}% + 2px)`,
        width: `calc(${((bar.right - bar.left) / 7) * 100}% - 4px)`,
      }}
    >
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm', badge.className)} title={t(`source.${s.source}`)}>
        {badge.label}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-semibold">{name}</span>
        <span className="block truncate text-[11px] opacity-80">
          {s.status === 'PENDING' ? t('calendar.toConfirm') : t('stays.guestsCount', { count: s.guestCount || s.adults + s.children })}
          {tall && s.mainGuest?.nationality ? ` · ${s.mainGuest.nationality}` : ''}
        </span>
      </span>
      {wide && s.totalAccommodation > 0 && (
        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(s.totalAccommodation, locale)}</span>
      )}
    </button>
  );
}

function DayView({
  room,
  stays,
  day,
  canCreate,
  onOpenStay,
  onNewStay,
}: {
  room: RoomDto;
  stays: StaySummaryDto[];
  day: IsoDate;
  canCreate: boolean;
  onOpenStay: (id: string) => void;
  onNewStay: (checkIn: IsoDate) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const live = stays.filter((s) => s.status !== 'CANCELLED');
  const groups: { key: string; icon: typeof Moon; items: StaySummaryDto[] }[] = [
    { key: 'arriving', icon: LogIn, items: live.filter((s) => s.checkInDate === day) },
    { key: 'staying', icon: Moon, items: live.filter((s) => s.checkInDate < day && day < s.checkOutDate) },
    { key: 'departing', icon: LogOut, items: live.filter((s) => s.checkOutDate === day) },
  ];
  const free = !occupied(stays, day);

  return (
    <div className="flex flex-col gap-4">
      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <div key={g.key} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <g.icon className="size-4" aria-hidden />
                {t(`calendar.day.${g.key}`)}
              </h3>
              {g.items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenStay(s.id)}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-start hover:bg-accent"
                >
                  <span className={cn('flex size-9 items-center justify-center rounded-full text-sm font-bold', SOURCE_BADGE[s.source].className, 'ring-1 ring-border')}>
                    {SOURCE_BADGE[s.source].label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{guestName(s, t('calendar.noGuestYet'))}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(s.checkInDate, locale)} → {formatDate(s.checkOutDate, locale)} · {t('stays.nightsCount', { count: s.nights })} ·{' '}
                      {t('stays.guestsCount', { count: s.guestCount || s.adults + s.children })} · {t(`source.${s.source}`)}
                    </span>
                  </span>
                  <StayStatusBadge status={s.status} />
                </button>
              ))}
            </div>
          ),
      )}
      {free && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
          <span className="text-sm text-muted-foreground">
            {t('calendar.freeNight', { price: formatMoney(room.basePrice, locale) })}
          </span>
          {canCreate && day >= todayIso() && (
            <Button size="sm" onClick={() => onNewStay(day)}>
              <Plus aria-hidden />
              {t('stays.new')}
            </Button>
          )}
        </div>
      )}
      {!free && groups.every((g) => g.items.length === 0) && <p className="text-sm text-muted-foreground">{t('calendar.noData')}</p>}
    </div>
  );
}

function Legend() {
  const t = useTranslations();
  const items: [string, string][] = [
    ['bg-teal-900', t('stayStatus.CHECKED_IN')],
    ['bg-amber-200 ring-1 ring-amber-300', t('stayStatus.PENDING')],
    ['bg-teal-100', t('stayStatus.CHECKED_OUT')],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([cls, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-full', cls)} aria-hidden />
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-sm border" style={HATCH} aria-hidden />
        {t('calendar.past')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Brush className="size-3" aria-hidden />
        {t('calendar.cleaningHint')}
      </span>
    </div>
  );
}
