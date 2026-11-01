'use client';

import type { StaySummaryDto } from '@riad/shared';
import { ArrowRight, ChevronRight, Moon, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { roomMark, SOURCE_BADGE } from '@/components/calendar/styles';
import { StayStatusBadge } from '@/components/status-badges';
import { useRouter } from '@/i18n/navigation';
import { nationalityName } from '@/lib/countries';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const short: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const initials = (s: StaySummaryDto) =>
  s.mainGuest ? `${s.mainGuest.firstName[0] ?? ''}${s.mainGuest.lastName[0] ?? ''}`.toUpperCase() : '?';

/** Stays as a table on wide screens and cards on phones; each row opens the stay. */
export function StayList({ stays, today }: { stays: StaySummaryDto[]; today: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const open = (s: StaySummaryDto) => router.push(`/dashboard/stays/${s.id}`);
  const name = (s: StaySummaryDto) => (s.mainGuest ? `${s.mainGuest.firstName} ${s.mainGuest.lastName}` : t('calendar.noGuestYet'));
  const room = (s: StaySummaryDto) => s.room ?? s.requestedRoom;
  // Arriving or leaving today, or still here after the departure date: worth a glance.
  const flag = (s: StaySummaryDto) =>
    s.status === 'CHECKED_IN' && s.checkOutDate < today
      ? { label: t('today.overdue'), className: 'bg-red-50 text-red-700 ring-1 ring-red-200' }
      : s.status !== 'CANCELLED' && s.checkInDate === today && s.status !== 'CHECKED_OUT'
        ? { label: t('stays.arrivesToday'), className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' }
        : s.status === 'CHECKED_IN' && s.checkOutDate === today
          ? { label: t('stays.leavesToday'), className: 'bg-teal-100 text-teal-900' }
          : null;

  return (
    <>
      {/* Wide screens: table. */}
      <div className="overflow-hidden rounded-2xl border bg-card max-md:hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t('stays.mainGuest')}</th>
              <th className="px-3 py-3 text-start font-medium">{t('stays.dates')}</th>
              <th className="px-3 py-3 text-start font-medium">{t('stays.room')}</th>
              <th className="px-3 py-3 text-start font-medium">{t('stays.source')}</th>
              <th className="px-3 py-3 text-end font-medium">{t('stays.totalAccommodation')}</th>
              <th className="px-3 py-3 text-start font-medium">{t('stays.status')}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {stays.map((s) => {
              const r = room(s);
              const f = flag(s);
              const badge = SOURCE_BADGE[s.source];
              return (
                <tr
                  key={s.id}
                  onClick={() => open(s)}
                  onKeyDown={(e) => e.key === 'Enter' && open(s)}
                  tabIndex={0}
                  className={cn('cursor-pointer transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none', s.status === 'CANCELLED' && 'opacity-60')}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900" aria-hidden>
                        {initials(s)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{name(s)}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[nationalityName(s.mainGuest?.nationality, locale), s.externalRef].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 font-medium">
                      {formatDate(s.checkInDate, locale, short)}
                      <ArrowRight className="size-3.5 text-muted-foreground rtl:rotate-180" aria-hidden />
                      {formatDate(s.checkOutDate, locale, short)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Moon className="size-3" aria-hidden />
                        {t('stays.nightsCount', { count: s.nights })}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3" aria-hidden />
                        {s.adults + s.children}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {r ? (
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold" aria-hidden>
                          {roomMark(r.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate">{r.name}</div>
                          {!s.room && <div className="text-xs text-amber-700">{t('stays.requested')}</div>}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{t('stays.noRoom')}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className={cn('flex size-6 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-border', badge.className)} aria-hidden>
                        {badge.label}
                      </span>
                      <span className="text-muted-foreground">{t(`source.${s.source}`)}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-end font-medium whitespace-nowrap tabular-nums">
                    {s.totalAccommodation > 0 ? formatMoney(s.totalAccommodation, locale) : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <StayStatusBadge status={s.status} />
                      {f && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', f.className)}>{f.label}</span>}
                    </div>
                  </td>
                  <td className="pe-3">
                    <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: cards. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {stays.map((s) => {
          const r = room(s);
          const f = flag(s);
          const badge = SOURCE_BADGE[s.source];
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => open(s)}
                className={cn('flex w-full flex-col gap-3 rounded-2xl border bg-card p-3.5 text-start', s.status === 'CANCELLED' && 'opacity-60')}
              >
                <span className="flex w-full items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900" aria-hidden>
                    {initials(s)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name(s)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {nationalityName(s.mainGuest?.nationality, locale) ?? t(`source.${s.source}`)}
                    </span>
                  </span>
                  <StayStatusBadge status={s.status} />
                </span>
                <span className="grid w-full grid-cols-3 gap-2 rounded-xl bg-muted/60 p-2.5 text-xs">
                  <span>
                    <span className="block text-muted-foreground">{t('stays.dates')}</span>
                    <span className="font-medium whitespace-nowrap">
                      {formatDate(s.checkInDate, locale, short)} → {formatDate(s.checkOutDate, locale, short)}
                    </span>
                  </span>
                  <span>
                    <span className="block text-muted-foreground">{t('stays.room')}</span>
                    <span className="block truncate font-medium">{r?.name ?? '—'}</span>
                  </span>
                  <span className="text-end">
                    <span className="block text-muted-foreground">{t('stays.nights')}</span>
                    <span className="font-medium tabular-nums">{s.nights}</span>
                  </span>
                </span>
                <span className="flex w-full items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className={cn('flex size-5 items-center justify-center rounded-full text-[10px] font-bold ring-1 ring-border', badge.className)} aria-hidden>
                      {badge.label}
                    </span>
                    {t(`source.${s.source}`)}
                    {f && <span className={cn('ms-1 rounded-full px-2 py-0.5 font-medium', f.className)}>{f.label}</span>}
                  </span>
                  <span className="font-semibold tabular-nums">{s.totalAccommodation > 0 ? formatMoney(s.totalAccommodation, locale) : ''}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
