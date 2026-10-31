'use client';

import { PAYMENT_METHODS, parseMadToCentimes, paymentFormSchema, type CashWalletDto, type PaymentMethod } from '@riad/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { centimesToInput } from '@/lib/format';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/** Record a payment; the amount is prefilled with what the guest still owes. */
export function PaymentDialog({
  stayId,
  suggested,
  open,
  onOpenChange,
  onDone,
}: {
  stayId: string;
  suggested: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [walletId, setWalletId] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();
  const { user, can } = useAuth();
  // Cash goes into a cash box: yours by default; managers, who see every box, can pick.
  const boxes = useApiQuery<CashWalletDto[]>(open && can('expenses.write', 'expenses.write_petty_cash') ? '/cash-wallets' : null);
  const active = (boxes.data ?? []).filter((b) => b.isActive);
  const defaultBox = (active.find((b) => b.holder.id === user.id) ?? active[0])?.id ?? '';

  useEffect(() => {
    if (!open) return;
    setAmount(suggested > 0 ? centimesToInput(suggested) : '');
    setMethod('CASH');
    setNote('');
    setWalletId('');
    setErrors({});
    setError(null);
  }, [open, suggested, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = paymentFormSchema.safeParse({ amountMad: amount, method, note });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const ok = await run(() =>
      api(`/stays/${stayId}/payments`, {
        method: 'POST',
        body: {
          amount: parseMadToCentimes(parsed.data.amountMad),
          method,
          note: parsed.data.note,
          ...(method === 'CASH' && (walletId || defaultBox) ? { walletId: walletId || defaultBox } : {}),
        },
      }),
    );
    if (ok) {
      onOpenChange(false);
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('payments.add')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField id="pay-amount" label={t('payments.amount')} error={errors.amountMad}>
            <Input
              id="pay-amount"
              inputMode="decimal"
              dir="ltr"
              className="text-lg font-semibold"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </FormField>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t('payments.method')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  aria-pressed={method === m}
                  className={cn(
                    'min-h-12 rounded-lg border px-3 text-sm font-medium transition-colors',
                    method === m ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
                  )}
                >
                  {t(`paymentMethod.${m}`)}
                </button>
              ))}
            </div>
          </fieldset>
          {method === 'CASH' && active.length > 1 && (
            <FormField id="pay-box" label={t('payments.cashBox')}>
              <Select id="pay-box" value={walletId || defaultBox} onChange={(e) => setWalletId(e.target.value)}>
                {active.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.holder.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {method === 'CASH' && active.length === 1 && (
            <p className="text-sm text-muted-foreground">{t('payments.intoBox', { name: active[0]!.name })}</p>
          )}
          <FormField id="pay-note" label={t('payments.note')} error={errors.note}>
            <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t('common.saving') : t('payments.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
