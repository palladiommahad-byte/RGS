'use client';

import type { BillDto, CheckoutResultDto, StaySummaryDto } from '@riad/shared';
import { CircleCheckBig, FileDown, LogOut, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { BillSummary } from '@/components/billing/bill-summary';
import { PaymentDialog } from '@/components/billing/payment-dialog';
import { openInvoicePdf } from '@/components/billing/stay-billing';
import { FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useAction, useApiQuery } from '@/lib/use-api';

/**
 * Checkout: shows the bill, lets reception settle the balance, then issues the numbered
 * invoice (room -> cleaning) and offers the PDF.
 */
export function CheckoutButton({
  stay,
  onDone,
  size = 'default',
  compact,
}: {
  stay: Pick<StaySummaryDto, 'id' | 'mainGuest' | 'room'>;
  onDone: () => void;
  size?: 'default' | 'lg';
  /** Small outline button for dense lists. */
  compact?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [acceptBalance, setAcceptBalance] = useState(false);
  const [result, setResult] = useState<CheckoutResultDto | null>(null);
  const bill = useApiQuery<BillDto>(open ? `/stays/${stay.id}/bill` : null);
  const { run, pending, error, setError } = useAction();
  const name = stay.mainGuest ? `${stay.mainGuest.firstName} ${stay.mainGuest.lastName}` : '';
  const owes = (bill.data?.balance ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    setAcceptBalance(false);
    setResult(null);
    setError(null);
  }, [open, setError]);

  async function confirm() {
    const res = await run(() =>
      api<CheckoutResultDto>(`/stays/${stay.id}/checkout`, { method: 'POST', body: { acceptBalanceDue: acceptBalance } }),
    );
    if (res) setResult(res);
  }

  function close(next: boolean) {
    setOpen(next);
    if (!next && result) onDone();
  }

  return (
    <>
      <Button size={compact ? 'sm' : size} variant={compact ? 'outline' : 'default'} onClick={() => setOpen(true)}>
        <LogOut className="rtl:rotate-180" aria-hidden />
        {t('stays.checkout')}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('checkout.title')}</DialogTitle>
            {!result && <DialogDescription>{t('checkout.description', { name })}</DialogDescription>}
          </DialogHeader>

          {result ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CircleCheckBig className="size-8" aria-hidden />
              </span>
              <p className="font-semibold" dir="auto">
                {t('checkout.done', { number: result.invoice.number })}
              </p>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                <Button variant="outline" onClick={() => void run(() => openInvoicePdf(result.invoice.id))}>
                  <FileDown aria-hidden />
                  {t('checkout.downloadInvoice')}
                </Button>
                <Button onClick={() => close(false)}>{t('checkout.close')}</Button>
              </div>
              <FormError message={error} />
            </div>
          ) : (
            <>
              {bill.data ? <BillSummary bill={bill.data} compact /> : <div className="h-40 animate-pulse rounded-lg bg-muted" />}
              {owes && (
                <div className="flex flex-col gap-3">
                  <Button variant="secondary" size="lg" onClick={() => setPaying(true)}>
                    <Wallet aria-hidden />
                    {t('checkout.settle')}
                  </Button>
                  <label className="flex items-start gap-3 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
                      checked={acceptBalance}
                      onChange={(e) => setAcceptBalance(e.target.checked)}
                    />
                    {t('checkout.acceptBalance')}
                  </label>
                </div>
              )}
              <FormError message={error} />
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t('common.cancel')}</Button>
                </DialogClose>
                <Button onClick={() => void confirm()} disabled={pending || !bill.data || (owes && !acceptBalance)}>
                  {t('checkout.confirm')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <PaymentDialog
        stayId={stay.id}
        suggested={Math.max(0, bill.data?.balance ?? 0)}
        open={paying}
        onOpenChange={setPaying}
        onDone={bill.reload}
      />
    </>
  );
}
