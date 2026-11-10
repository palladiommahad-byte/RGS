'use client';

import type { BillDto, StayDetailDto } from '@riad/shared';
import { FileDown, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { FormError } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { useAction } from '@/lib/use-api';
import { BillSummary } from './bill-summary';
import { EXTRA_ICONS } from './extra-icons';
import { ExtraDialog } from './extra-dialog';
import { PaymentDialog } from './payment-dialog';

export async function openInvoicePdf(invoiceId: string): Promise<void> {
  // Open the tab first (popup blockers), then point it at the 5-minute signed link.
  const tab = window.open('', '_blank');
  try {
    const { url } = await api<{ url: string }>(`/invoices/${invoiceId}/pdf`);
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/** Bill, extras, payments and invoices of a stay. */
export function StayBilling({
  stay,
  bill,
  onChanged,
}: {
  stay: StayDetailDto;
  bill: BillDto | undefined;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { can } = useAuth();
  const [dialog, setDialog] = useState<'extra' | 'payment' | null>(null);
  const action = useAction();
  const m = (c: number) => formatMoney(c, locale);
  const extrasOpen = (stay.status === 'PENDING' || stay.status === 'CHECKED_IN') && can('stays.write');
  const canPay = stay.status !== 'CANCELLED' && can('payments.write');

  async function removeExtra(id: string, label: string) {
    if (!window.confirm(t('extras.deleteConfirm', { label }))) return;
    if (await action.run(() => api(`/stays/${stay.id}/extras/${id}`, { method: 'DELETE' }))) onChanged();
  }

  async function removePayment(id: string, amount: number) {
    if (!window.confirm(t('payments.deleteConfirm', { amount: m(amount) }))) return;
    if (await action.run(() => api(`/stays/${stay.id}/payments/${id}`, { method: 'DELETE' }))) onChanged();
  }

  return (
    <>
      <FormError message={action.error} />
      <div className="grid gap-6 xl:grid-cols-5 [&>*]:min-w-0">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('bill.title')}</CardTitle>
            </CardHeader>
            <CardContent>{bill ? <BillSummary bill={bill} /> : <div className="h-40 animate-pulse rounded-lg bg-muted" />}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('invoices.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {stay.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('invoices.empty')}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {stay.invoices.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div>
                        <div className="font-medium" dir="ltr">
                          {inv.number}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t('invoices.issuedOn', { date: formatDate(inv.issuedAt.slice(0, 10), locale) })} · {m(inv.totalTtc)}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => void action.run(() => openInvoicePdf(inv.id))}>
                        <FileDown aria-hidden />
                        {t('invoices.download')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6 xl:col-span-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t('extras.title')}</CardTitle>
              {extrasOpen && (
                <Button variant="outline" size="sm" onClick={() => setDialog('extra')}>
                  <Plus aria-hidden />
                  {t('extras.add')}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {stay.extras.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('extras.empty')}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {stay.extras.map((e) => {
                    const Icon = EXTRA_ICONS[e.category];
                    return (
                      <li key={e.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border text-teal-900">
                          <Icon className="size-[18px]" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{e.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {t(`extraCategory.${e.category}`)} · {e.quantity} × {m(e.unitPrice)}
                          </div>
                        </div>
                        <span className="font-medium tabular-nums">{m(e.total)}</span>
                        {extrasOpen && (
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void removeExtra(e.id, e.label)} aria-label={t('common.delete')}>
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {!extrasOpen && stay.status === 'CHECKED_OUT' && (
                <p className="mt-3 text-xs text-muted-foreground">{t('extras.locked')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t('payments.title')}</CardTitle>
              {canPay && (
                <Button size="sm" onClick={() => setDialog('payment')}>
                  <Plus aria-hidden />
                  {t('payments.add')}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {stay.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('payments.empty')}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {stay.payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge tone="teal">{t(`paymentMethod.${p.method}`)}</Badge>
                          {p.note && <span className="truncate text-sm text-muted-foreground">{p.note}</span>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDateTime(p.paidAt, locale)}
                          {p.receivedBy && ` · ${t('payments.receivedBy', { name: p.receivedBy.name })}`}
                        </div>
                      </div>
                      <span className="font-semibold tabular-nums">{m(p.amount)}</span>
                      {canPay && stay.status !== 'CHECKED_OUT' && (
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void removePayment(p.id, p.amount)} aria-label={t('common.delete')}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ExtraDialog stayId={stay.id} open={dialog === 'extra'} onOpenChange={(o) => setDialog(o ? 'extra' : null)} onDone={onChanged} />
      <PaymentDialog
        stayId={stay.id}
        suggested={Math.max(0, bill?.balance ?? 0)}
        open={dialog === 'payment'}
        onOpenChange={(o) => setDialog(o ? 'payment' : null)}
        onDone={onChanged}
      />
    </>
  );
}
