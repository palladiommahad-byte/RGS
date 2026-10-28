'use client';

import type { BillDto, GuestDto, Paginated, RoomDto, StayDetailDto } from '@riad/shared';
import { ArrowLeft, Ban, CheckCircle2, Pencil, Plus, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { StayBilling } from '@/components/billing/stay-billing';
import { FormError } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { StayStatusBadge } from '@/components/status-badges';
import { CheckoutButton } from '@/components/stays/checkout-button';
import { GuestDocuments } from '@/components/stays/guest-documents';
import { ConfirmStayDialog, EditStayDialog, GuestDialog } from '@/components/stays/stay-dialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { useAction, useApiQuery } from '@/lib/use-api';

export default function StayDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const router = useRouter();
  const stay = useApiQuery<StayDetailDto>(`/stays/${id}`);
  const rooms = useApiQuery<Paginated<RoomDto>>(can('rooms.read') ? '/rooms?limit=100' : null);
  const bill = useApiQuery<BillDto>(`/stays/${id}/bill`);
  const [dialog, setDialog] = useState<'confirm' | 'edit' | 'guest' | null>(null);
  const [editingGuest, setEditingGuest] = useState<GuestDto | undefined>();
  const action = useAction();

  const reload = () => {
    stay.reload();
    rooms.reload();
    bill.reload();
  };

  if (stay.error) {
    return (
      <p role="alert" className="text-destructive">
        {stay.error.status === 404 ? t('stays.notFound') : t('errors.generic')}
      </p>
    );
  }
  const s = stay.data;
  if (!s) return <p className="text-muted-foreground">{t('common.loading')}</p>;

  const editable = s.status === 'PENDING' || s.status === 'CHECKED_IN';
  const canWrite = can('stays.write');
  const roomList = rooms.data?.items ?? [];
  const title = s.mainGuest ? `${s.mainGuest.firstName} ${s.mainGuest.lastName}` : t('stays.stay');

  async function cancelStay() {
    if (!window.confirm(t('stays.cancelConfirm'))) return;
    if (await action.run(() => api(`/stays/${s!.id}/cancel`, { method: 'POST' }))) reload();
  }

  async function rejectStay() {
    if (!window.confirm(t('stays.rejectConfirm'))) return;
    if (await action.run(() => api(`/stays/${s!.id}/reject`, { method: 'POST' }))) router.replace('/dashboard');
  }

  async function removeGuest(g: GuestDto) {
    if (!window.confirm(t('stays.removeGuestConfirm', { name: `${g.firstName} ${g.lastName}` }))) return;
    if (await action.run(() => api(`/stays/${s!.id}/guests/${g.id}`, { method: 'DELETE' }))) reload();
  }

  function openGuest(g?: GuestDto) {
    setEditingGuest(g);
    setDialog('guest');
  }

  const rows: [string, React.ReactNode][] = [
    [t('stays.checkIn'), formatDate(s.checkInDate, locale)],
    [t('stays.checkOut'), formatDate(s.checkOutDate, locale)],
    [t('stays.nights'), s.nights],
    [t('stays.occupants'), `${t('stays.adultsCount', { count: s.adults })} · ${t('stays.childrenCount', { count: s.children })}`],
    [s.room ? t('stays.room') : t('stays.requestedRoom'), s.room?.name ?? s.requestedRoom?.name ?? '—'],
    [t('stays.source'), t(`source.${s.source}`)],
    [t('stays.externalRef'), s.externalRef ?? '—'],
    [t('stays.pricePerNight'), formatMoney(s.pricePerNight, locale)],
    [t('stays.totalAccommodation'), <strong key="total">{formatMoney(s.totalAccommodation, locale)}</strong>],
    [t('stays.otaCommission'), formatMoney(s.otaCommission, locale)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" asChild className="self-start">
        <Link href="/dashboard/stays">
          <ArrowLeft className="rtl:rotate-180" aria-hidden />
          {t('nav.stays')}
        </Link>
      </Button>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {title}
            <StayStatusBadge status={s.status} />
          </span>
        }
        subtitle={
          s.confirmedBy && s.confirmedAt
            ? t('stays.confirmedBy', { name: s.confirmedBy.name, date: formatDateTime(s.confirmedAt, locale) })
            : undefined
        }
        actions={
          <>
            {s.status === 'PENDING' && can('checkin.confirm') && (
              <Button size="lg" onClick={() => setDialog('confirm')}>
                <CheckCircle2 aria-hidden />
                {t('stays.confirm')}
              </Button>
            )}
            {s.status === 'CHECKED_IN' && canWrite && <CheckoutButton stay={s} onDone={reload} size="lg" />}
            {editable && canWrite && (
              <Button size="lg" variant="outline" onClick={() => setDialog('edit')}>
                <Pencil aria-hidden />
                {t('common.edit')}
              </Button>
            )}
            {s.status === 'PENDING' && can('checkin.confirm') && (
              <Button size="lg" variant="ghost" className="text-destructive" onClick={() => void rejectStay()}>
                <Ban aria-hidden />
                {t('stays.reject')}
              </Button>
            )}
            {s.status === 'PENDING' && canWrite && (
              <Button size="lg" variant="ghost" className="text-destructive" onClick={() => void cancelStay()}>
                <XCircle aria-hidden />
                {t('stays.cancelStay')}
              </Button>
            )}
          </>
        }
      />

      <FormError message={action.error} />

      {s.status === 'PENDING' && (
        <p className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          {t('stays.verifyHint')}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t('stays.info')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-end font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {s.notes && <p className="mt-4 rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{s.notes}</p>}
            {s.checkedOutAt && (
              <p className="mt-4 text-sm text-muted-foreground">
                {t('stays.checkedOutAt', { date: formatDateTime(s.checkedOutAt, locale) })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t('stays.guests', { count: s.guests.length })}</CardTitle>
            {canWrite && s.status !== 'CANCELLED' && (
              <Button variant="outline" size="sm" onClick={() => openGuest()}>
                <Plus aria-hidden />
                {t('stays.addGuest')}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {s.guests.map((g) => (
                <li key={g.id} className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row">
                  <GuestDocuments stayId={s.id} guest={g} />
                  <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {g.firstName} {g.lastName}
                      </span>
                      {g.isMain && <Badge tone="blue">{t('stays.main')}</Badge>}
                      {g.nationality && <Badge dir="ltr">{g.nationality}</Badge>}
                    </div>
                    {canWrite && s.status !== 'CANCELLED' && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openGuest(g)}>
                          <Pencil aria-hidden />
                          {t('common.edit')}
                        </Button>
                        {!g.isMain && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void removeGuest(g)}>
                            <Trash2 aria-hidden />
                            <span className="sr-only">{t('common.delete')}</span>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm 2xl:grid-cols-2">
                    <GuestLine label={t('guest.document')}>
                      {(g.documentType || g.documentNumber) && (
                        <>
                          {g.documentType && t(`documentType.${g.documentType}`)}
                          {g.documentNumber && (
                            <span dir="ltr" className="ms-1 font-mono">
                              {g.documentNumber}
                            </span>
                          )}
                        </>
                      )}
                    </GuestLine>
                    <GuestLine label={t('guest.birthDate')}>{g.birthDate && formatDate(g.birthDate, locale)}</GuestLine>
                    <GuestLine label={t('guest.phone')}>{g.phone && <span dir="ltr">{g.phone}</span>}</GuestLine>
                    <GuestLine label={t('guest.email')}>{g.email}</GuestLine>
                    <GuestLine label={t('guest.documentExpiry')}>{g.documentExpiry && formatDate(g.documentExpiry, locale)}</GuestLine>
                    <GuestLine label={t('guest.sex')}>{g.sex && t(`sex.${g.sex}`)}</GuestLine>
                  </dl>
                  {g.consentAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t('stays.consentAt', { date: formatDateTime(g.consentAt, locale) })}
                    </p>
                  )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <StayBilling stay={s} bill={bill.data} onChanged={reload} />

      <ConfirmStayDialog stay={s} rooms={roomList} open={dialog === 'confirm'} onOpenChange={(o) => setDialog(o ? 'confirm' : null)} onDone={reload} />
      <EditStayDialog stay={s} rooms={roomList} open={dialog === 'edit'} onOpenChange={(o) => setDialog(o ? 'edit' : null)} onDone={reload} />
      <GuestDialog stayId={s.id} guest={editingGuest} open={dialog === 'guest'} onOpenChange={(o) => setDialog(o ? 'guest' : null)} onDone={reload} />
    </div>
  );
}

function GuestLine({ label, children }: { label: string; children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === '' || children === false;
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 break-words font-medium">{empty ? '—' : children}</dd>
    </div>
  );
}
