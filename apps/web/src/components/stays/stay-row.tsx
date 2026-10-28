'use client';

import type { StaySummaryDto } from '@riad/shared';
import { BedDouble, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { StayStatusBadge } from '@/components/status-badges';
import { Link } from '@/i18n/navigation';
import { formatDate } from '@/lib/format';

/** One stay as a large tappable row; `action` renders on the end side (e.g. a button). */
export function StayRow({ stay, action }: { stay: StaySummaryDto; action?: React.ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const roomName = stay.room?.name ?? stay.requestedRoom?.name;
  const short: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-3 ps-4">
      <Link href={`/dashboard/stays/${stay.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">
              {stay.mainGuest ? `${stay.mainGuest.firstName} ${stay.mainGuest.lastName}` : '—'}
            </span>
            <StayStatusBadge status={stay.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {formatDate(stay.checkInDate, locale, short)} → {formatDate(stay.checkOutDate, locale, short)}
            </span>
            <span>{t('stays.nightsCount', { count: stay.nights })}</span>
            <span>{t('stays.guestsCount', { count: stay.adults + stay.children })}</span>
            {roomName && (
              <span className="inline-flex items-center gap-1">
                <BedDouble className="size-4" aria-hidden />
                {roomName}
                {!stay.room && ` (${t('stays.requested')})`}
              </span>
            )}
          </div>
        </div>
        {!action && <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />}
      </Link>
      {action}
    </li>
  );
}
