'use client';

import type { StaySummaryDto } from '@riad/shared';
import { BedDouble, Clock, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Task-style list of check-ins waiting for staff; the oldest one is emphasised. */
export function PendingList({ stays, emptyLabel }: { stays: StaySummaryDto[]; emptyLabel: string }) {
  const t = useTranslations();
  const locale = useLocale();

  if (stays.length === 0) {
    return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {stays.map((s, i) => {
        const first = i === 0;
        const room = s.room ?? s.requestedRoom;
        return (
          <li key={s.id}>
            <Link
              href={`/dashboard/stays/${s.id}`}
              className={cn(
                'block rounded-lg border p-3.5 transition-colors',
                first ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary-hover' : 'bg-card hover:bg-accent',
              )}
            >
              <div className={cn('flex items-center gap-1.5 text-xs', first ? 'text-white/75' : 'text-muted-foreground')}>
                <Clock className="size-3.5" aria-hidden />
                {timeAgo(s.createdAt, locale)}
              </div>
              <div className="mt-1 truncate font-semibold">
                {s.mainGuest ? `${s.mainGuest.firstName} ${s.mainGuest.lastName}` : '—'}
              </div>
              <div className={cn('mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', first ? 'text-white/80' : 'text-muted-foreground')}>
                {room && (
                  <span className="inline-flex items-center gap-1">
                    <BedDouble className="size-3.5" aria-hidden />
                    {room.name}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" aria-hidden />
                  {t('stays.guestsCount', { count: s.adults + s.children })}
                </span>
                <span>{t('stays.nightsCount', { count: s.nights })}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
