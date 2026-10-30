'use client';

import type { StayDetailDto } from '@riad/shared';
import { ArrowRight, Mail, Phone, QrCode } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { StayStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Link } from '@/i18n/navigation';
import { nationalityName } from '@/lib/countries';
import { formatDate, formatMoney } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

/**
 * Quick look at a stay from the calendar: dates, amounts and the guests as they filled in
 * the QR check-in. Document numbers and passport photos are left to the full stay page.
 */
export function StaySheet({ stayId, onOpenChange }: { stayId: string | null; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const query = useApiQuery<StayDetailDto>(stayId ? `/stays/${stayId}` : null);
  const s = query.data?.id === stayId ? query.data : undefined;
  const main = s?.guests.find((g) => g.isMain) ?? s?.guests[0];

  return (
    <Dialog open={!!stayId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {main ? `${main.firstName} ${main.lastName}` : t('calendar.noGuestYet')}
            {s && <StayStatusBadge status={s.status} />}
          </DialogTitle>
        </DialogHeader>

        {!s ? (
          <p className="py-6 text-center text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted/60 p-3 text-sm">
              <Item label={t('stays.checkIn')} value={formatDate(s.checkInDate, locale, { weekday: 'short', day: 'numeric', month: 'short' })} />
              <Item label={t('stays.checkOut')} value={formatDate(s.checkOutDate, locale, { weekday: 'short', day: 'numeric', month: 'short' })} />
              <Item label={t('stays.room')} value={s.room?.name ?? (s.requestedRoom ? `${s.requestedRoom.name} (${t('stays.requested')})` : t('stays.noRoom'))} />
              <Item label={t('stays.occupants')} value={`${t('stays.adultsCount', { count: s.adults })}${s.children ? ` · ${t('stays.childrenCount', { count: s.children })}` : ''}`} />
              <Item label={t('stays.source')} value={`${t(`source.${s.source}`)}${s.externalRef ? ` · ${s.externalRef}` : ''}`} />
              <Item
                label={t('stays.totalAccommodation')}
                value={`${formatMoney(s.totalAccommodation, locale)} · ${t('stays.nightsCount', { count: s.nights })}`}
              />
            </dl>

            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                {t('stays.guests', { count: s.guests.length })}
                {s.guests.some((g) => g.consentAt) && (
                  <Badge tone="teal">
                    <QrCode className="size-3" aria-hidden />
                    {t('calendar.fromQr')}
                  </Badge>
                )}
              </h3>
              {s.guests.length === 0 && <p className="text-sm text-muted-foreground">{t('calendar.noGuestYet')}</p>}
              <ul className="flex flex-col divide-y rounded-lg border">
                {s.guests.map((g) => (
                  <li key={g.id} className="flex flex-col gap-1 p-3 text-sm">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {g.firstName} {g.lastName}
                      {g.isMain && <Badge tone="gray">{t('stays.main')}</Badge>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[nationalityName(g.nationality, locale), g.documentType && t(`documentType.${g.documentType}`), g.birthDate && formatDate(g.birthDate, locale)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {(g.phone || g.email) && (
                      <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {g.phone && (
                          <a href={`tel:${g.phone}`} className="inline-flex items-center gap-1 text-teal-700 hover:underline" dir="ltr">
                            <Phone className="size-3.5" aria-hidden />
                            {g.phone}
                          </a>
                        )}
                        {g.email && (
                          <a href={`mailto:${g.email}`} className="inline-flex items-center gap-1 text-teal-700 hover:underline" dir="ltr">
                            <Mail className="size-3.5" aria-hidden />
                            {g.email}
                          </a>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {s.notes && <p className="rounded-lg border border-dashed p-3 text-sm whitespace-pre-line">{s.notes}</p>}

            <Link href={`/dashboard/stays/${s.id}`} className={buttonVariants({ className: 'self-end' })}>
              {s.status === 'PENDING' ? t('calendar.openToConfirm') : t('calendar.openStay')}
              <ArrowRight className="rtl:rotate-180" aria-hidden />
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
