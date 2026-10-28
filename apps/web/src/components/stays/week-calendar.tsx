'use client';

import { addDays, nightsBetween, type IsoDate, type StaySummaryDto, type StayStatus } from '@riad/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const BAR: Record<StayStatus, string> = {
  CHECKED_IN: 'bg-teal-900 text-white hover:bg-teal-700',
  PENDING: 'bg-teal-500 text-white hover:bg-teal-700',
  CHECKED_OUT: 'bg-teal-100 text-teal-900 hover:bg-teal-300',
  CANCELLED: 'hidden',
};

/** Monday of the week containing `iso`. */
export function weekStartOf(iso: IsoDate): IsoDate {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

type Segment = { stay: StaySummaryDto; start: number; end: number; lane: number };

/** Places each stay on the first lane where it does not overlap the previous bar. */
function layout(stays: StaySummaryDto[], weekStart: IsoDate): Segment[] {
  const segments = stays
    .filter((s) => s.status !== 'CANCELLED')
    .map((stay) => ({
      stay,
      start: Math.max(0, nightsBetween(weekStart, stay.checkInDate)),
      // A stay occupies the nights [check-in, check-out); keep at least one column.
      end: Math.min(7, Math.max(nightsBetween(weekStart, stay.checkOutDate), nightsBetween(weekStart, stay.checkInDate) + 1)),
      lane: 0,
    }))
    .filter((s) => s.end > 0 && s.start < 7)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const laneEnds: number[] = [];
  for (const seg of segments) {
    let lane = laneEnds.findIndex((end) => end <= seg.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = seg.end;
    seg.lane = lane;
  }
  return segments;
}

export function WeekCalendar({
  weekStart,
  today,
  stays,
  onWeekChange,
}: {
  weekStart: IsoDate;
  today: IsoDate;
  stays: StaySummaryDto[];
  onWeekChange: (weekStart: IsoDate) => void;
}) {
  const t = useTranslations('today');
  const locale = useLocale();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const segments = layout(stays, weekStart);
  const lanes = Math.max(4, ...segments.map((s) => s.lane + 1));
  const range = `${formatDate(days[0]!, locale, { day: 'numeric', month: 'short' })} – ${formatDate(days[6]!, locale, { day: 'numeric', month: 'short' })}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{range}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => onWeekChange(addDays(weekStart, -7))} aria-label={t('prevWeek')}>
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onWeekChange(weekStartOf(today))}>
            {t('thisWeek')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onWeekChange(addDays(weekStart, 7))} aria-label={t('nextWeek')}>
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 text-center text-sm font-medium">
            {days.map((d) => (
              <div key={d} className="pb-2">
                {formatDate(d, locale, { weekday: 'short' })}
              </div>
            ))}
          </div>
          <div className="relative overflow-hidden rounded-lg border">
            {/* Day columns */}
            <div className="absolute inset-0 grid grid-cols-7">
              {days.map((d) => (
                <div
                  key={d}
                  className={cn('border-e last:border-e-0', d === today ? 'bg-teal-100/50' : d < today ? 'bg-muted/60' : '')}
                >
                  <span className={cn('block px-2 pt-1.5 text-xs', d === today ? 'font-semibold text-teal-900' : 'text-muted-foreground')}>
                    {formatDate(d, locale, { day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
            {/* Stay bars */}
            <div
              className="relative grid grid-cols-7 gap-y-1.5 px-1 pt-8 pb-3"
              style={{ gridTemplateRows: `repeat(${lanes}, 2rem)` }}
            >
              {segments.map((s) => (
                <Link
                  key={s.stay.id}
                  href={`/dashboard/stays/${s.stay.id}`}
                  style={{ gridColumn: `${s.start + 1} / ${s.end + 1}`, gridRow: s.lane + 1 }}
                  className={cn(
                    'mx-0.5 flex min-w-0 items-center gap-1.5 truncate rounded-md px-2 text-xs font-medium transition-colors',
                    BAR[s.stay.status],
                  )}
                  title={`${s.stay.mainGuest?.firstName ?? ''} ${s.stay.mainGuest?.lastName ?? ''}`}
                >
                  <span className="truncate">
                    {s.stay.mainGuest ? `${s.stay.mainGuest.firstName} ${s.stay.mainGuest.lastName}` : '—'}
                  </span>
                  {(s.stay.room ?? s.stay.requestedRoom) && (
                    <span className="truncate opacity-75">{(s.stay.room ?? s.stay.requestedRoom)!.name}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Legend className="bg-teal-900" label={t('legendInHouse')} />
        <Legend className="bg-teal-500" label={t('legendPending')} />
        <Legend className="bg-teal-100" label={t('legendCheckedOut')} />
      </div>
    </div>
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
