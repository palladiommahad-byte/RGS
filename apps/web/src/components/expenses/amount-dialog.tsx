'use client';

import { parseMadToCentimes, walletAmountSchema } from '@riad/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form-field';
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
import { Input } from '@/components/ui/input';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * Amount + note dialog used for wallet top-ups and cash-count corrections.
 * With `signed`, the user picks "add" or "remove" (adjustments).
 */
export function AmountDialog({
  open,
  onOpenChange,
  title,
  description,
  signed,
  noteRequired,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  signed?: boolean;
  noteRequired?: boolean;
  onSubmit: (amountCentimes: number, note: string | undefined) => Promise<unknown>;
}) {
  const t = useTranslations();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sign, setSign] = useState<1 | -1>(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setNote('');
    setSign(1);
    setErrors({});
    setError(null);
  }, [open, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = walletAmountSchema.safeParse({ amountMad: amount, note });
    const errs: FieldErrors = parsed.success ? {} : fieldErrors(parsed.error);
    if (noteRequired && !note.trim()) errs.note = 'required';
    setErrors(errs);
    if (!parsed.success || Object.keys(errs).length) return;
    const ok = await run(async () => {
      await onSubmit(sign * parseMadToCentimes(parsed.data.amountMad), parsed.data.note);
      return true;
    });
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {signed && (
            <div className="grid grid-cols-2 gap-2">
              {([1, -1] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sign === s}
                  onClick={() => setSign(s)}
                  className={cn(
                    'min-h-12 rounded-lg border text-sm font-medium',
                    sign === s ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
                  )}
                >
                  {s === 1 ? t('wallets.addCash') : t('wallets.removeCash')}
                </button>
              ))}
            </div>
          )}
          <FormField id="amt" label={t('payments.amount')} error={errors.amountMad}>
            <Input id="amt" inputMode="decimal" dir="ltr" autoFocus className="text-lg font-semibold" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField id="amt-note" label={noteRequired ? t('wallets.reason') : t('payments.note')} error={errors.note}>
            <Input id="amt-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
