'use client';

import { type FinanceDashboardDto, type RoomDto, type StaySummaryDto } from '@riad/shared';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { roomMark, SOURCE_BADGE } from '@/components/calendar/styles';
import { StayStatusBadge } from '@/components/status-badges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { formatDate, formatMoney, intlLocale } from '@/lib/format';
import { cn } from '@/lib/utils';

const TEAL = '#134e48';
const TEAL_LIGHT = '#9fc4bd';

/** Revenue (area) and expenses (dashed line) over the last 6 months, HT. */
export function RevenueOverview({ months, className }: { months: FinanceDashboardDto['months']; className?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const compact = new Intl.NumberFormat(intlLocale(locale), { notation: 'compact', maximumFractionDigits: 1 });
  const data = months.map((m) => ({
    month: new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', timeZone: 'UTC' }).format(new Date(`${m.month}-01T00:00:00Z`)),
    revenue: m.revenue,
    expenses: m.expenses,
  }));
  return (
    <Card className={className}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>{t('today.revenueOverview')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('today.revenueOverviewHint')}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: TEAL }} aria-hidden />
            {t('finance.revenue')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: TEAL_LIGHT }} aria-hidden />
            {t('finance.expenses')}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div dir="ltr" className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TEAL} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} tick={{ fill: 'var(--muted-foreground)' }} />
              <YAxis tickFormatter={(v: number) => compact.format(v / 100)} tickLine={false} axisLine={false} fontSize={12} width={44} tick={{ fill: 'var(--muted-foreground)' }} />
              <Tooltip
                formatter={(v) => formatMoney(Number(v), locale)}
                contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="revenue" name={t('finance.revenue')} stroke={TEAL} strokeWidth={2.5} fill="url(#revenueFill)" />
              <Area type="monotone" dataKey="expenses" name={t('finance.expenses')} stroke={TEAL_LIGHT} strokeWidth={2} strokeDasharray="6 5" fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_COLORS: Record<RoomDto['status'], string> = {
  OCCUPIED: TEAL,
  FREE: '#5c948b',
  CLEANING: '#e0b04a',
  OUT_OF_SERVICE: '#d4dcda',
};
const STATUS_ORDER: RoomDto['status'][] = ['OCCUPIED', 'FREE', 'CLEANING', 'OUT_OF_SERVICE'];

/** Ring of today's room statuses, % occupied in the middle. */
export function RoomStatusRing({ rooms, className }: { rooms: RoomDto[]; className?: string }) {
  const t = useTranslations();
  const active = rooms.filter((r) => r.isActive);
  const total = active.length || 1;
  const counts = STATUS_ORDER.map((s) => ({ status: s, count: active.filter((r) => r.status === s).length }));
  const occupied = counts[0]!.count;
  // SVG ring: one arc per status.
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t('today.roomStatusTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center gap-5">
        <div className="relative size-44">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--muted)" strokeWidth="14" />
            {counts.map(({ status, count }) => {
              if (!count) return null;
              const len = (count / total) * C;
              const arc = (
                <circle
                  key={status}
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  stroke={STATUS_COLORS[status]}
                  strokeWidth="14"
                  strokeDasharray={`${Math.max(len - 2, 0)} ${C}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += len;
              return arc;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-semibold tabular-nums">{Math.round((occupied / total) * 100)}%</span>
            <span className="text-xs text-muted-foreground">{t('today.occupiedShort')}</span>
          </div>
        </div>
        <ul className="flex w-full flex-col gap-2.5 text-sm">
          {counts.map(({ status, count }) => (
            <li key={status} className="flex items-center gap-2.5">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: STATUS_COLORS[status] }} aria-hidden />
              <span className="flex-1 text-muted-foreground">{t(`roomStatus.${status}`)}</span>
              <span className="font-semibold tabular-nums">{t('today.roomsCount', { count })}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

type Filter = 'all' | 'arrivals' | 'departures' | 'inHouse';

/** Today's arrivals, departures and guests in house, as one table (cards on phones). */
export function MovementsTable({
  arrivals,
  departures,
  inHouse,
  className,
}: {
  arrivals: StaySummaryDto[];
  departures: StaySummaryDto[];
  inHouse: StaySummaryDto[];
  className?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>('all');
  const lists: Record<Exclude<Filter, 'all'>, StaySummaryDto[]> = { arrivals, departures, inHouse };
  const seen = new Set<string>();
  const rows = (filter === 'all' ? [...arrivals, ...departures, ...inHouse] : lists[filter]).filter((s) => !seen.has(s.id) && seen.add(s.id));
  const short: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const name = (s: StaySummaryDto) => (s.mainGuest ? `${s.mainGuest.firstName} ${s.mainGuest.lastName}` : t('calendar.noGuestYet'));
  const initialsOf = (s: StaySummaryDto) => (s.mainGuest ? `${s.mainGuest.firstName[0] ?? ''}${s.mainGuest.lastName[0] ?? ''}`.toUpperCase() : '?');

  return (
    <Card className={cn('gap-0 overflow-hidden pb-0', className)}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-4">
        <CardTitle>{t('today.movements')}</CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-muted p-1" role="tablist">
            {(['all', 'arrivals', 'departures', 'inHouse'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  'h-8 rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors',
                  filter === f ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`today.filter.${f}`)}
                {f !== 'all' && <span className="ms-1 tabular-nums opacity-60">{lists[f].length}</span>}
              </button>
            ))}
          </div>
          <Link href="/dashboard/stays" className="hidden h-9 items-center gap-1 rounded-xl border bg-card px-3 text-xs font-medium hover:bg-accent sm:inline-flex">
            {t('today.viewAll')}
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
      </CardHeader>

      {rows.length === 0 ? (
        <p className="border-t px-5 py-10 text-center text-sm text-muted-foreground">{t('today.noMovements')}</p>
      ) : (
        <>
          {/* Computers and tablets: table. */}
          <div className="overflow-x-auto border-t max-md:hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                <tr>
                  <th className="px-5 py-3 text-start font-semibold">{t('stays.mainGuest')}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t('stays.room')}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t('stays.dates')}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t('stays.source')}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t('stays.status')}</th>
                  <th className="px-3 py-3 text-end font-semibold">{t('stays.totalAccommodation')}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((s) => {
                  const room = s.room ?? s.requestedRoom;
                  const badge = SOURCE_BADGE[s.source];
                  return (
                    <tr key={s.id} className="group hover:bg-accent/40">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/stays/${s.id}`} className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-xs font-semibold text-teal-900" aria-hidden>
                            {initialsOf(s)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium group-hover:underline">{name(s)}</span>
                            <span className="block text-xs text-muted-foreground">{t('stays.guests', { count: s.adults + s.children })}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        {room ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-[11px] font-semibold" aria-hidden>
                              {roomMark(room.name)}
                            </span>
                            {room.name}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {formatDate(s.checkInDate, locale, short)} → {formatDate(s.checkOutDate, locale, short)}
                        <span className="block text-xs text-muted-foreground">{t('stays.nightsCount', { count: s.nights })}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <span className={cn('flex size-6 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-border', badge.className)} aria-hidden>
                            {badge.label}
                          </span>
                          {t(`source.${s.source}`)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <StayStatusBadge status={s.status} />
                      </td>
                      <td className="px-3 py-3 text-end font-semibold whitespace-nowrap tabular-nums">
                        {s.totalAccommodation > 0 ? formatMoney(s.totalAccommodation, locale) : '—'}
                      </td>
                      <td className="pe-4">
                        <Link href={`/dashboard/stays/${s.id}`} aria-label={name(s)} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
                          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phones: rows. */}
          <ul className="divide-y border-t md:hidden">
            {rows.map((s) => (
              <li key={s.id}>
                <Link href={`/dashboard/stays/${s.id}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-xs font-semibold text-teal-900" aria-hidden>
                    {initialsOf(s)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name(s)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[(s.room ?? s.requestedRoom)?.name, `${formatDate(s.checkInDate, locale, short)} → ${formatDate(s.checkOutDate, locale, short)}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <StayStatusBadge status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
