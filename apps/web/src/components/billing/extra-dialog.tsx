'use client';

import { EXTRA_CATEGORIES, extraFormSchema, parseMadToCentimes, type ExtraCategory } from '@riad/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
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
import { api } from '@/lib/api';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { EXTRA_ICONS } from './extra-icons';

export function ExtraDialog({
  stayId,
  open,
  onOpenChange,
  onDone,
}: {
  stayId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [category, setCategory] = useState<ExtraCategory>('FOOD');
  const [label, setLabel] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    setCategory('FOOD');
    setLabel('');
    setQuantity('1');
    setUnitPrice('');
    setErrors({});
    setError(null);
  }, [open, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = extraFormSchema.safeParse({ label, category, quantity, unitPriceMad: unitPrice });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const { label: l, quantity: q, unitPriceMad } = parsed.data;
    const ok = await run(() =>
      api(`/stays/${stayId}/extras`, {
        method: 'POST',
        body: { label: l, category, quantity: q, unitPrice: parseMadToCentimes(unitPriceMad) },
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
          <DialogTitle>{t('extras.add')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t('extras.category')}</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {EXTRA_CATEGORIES.map((c) => {
                const Icon = EXTRA_ICONS[c];
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    aria-pressed={category === c}
                    className={cn(
                      'flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-xs font-medium transition-colors',
                      category === c ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                    {t(`extraCategory.${c}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <FormField id="extra-label" label={t('extras.label')} error={errors.label}>
            <Input id="extra-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <FormField id="extra-qty" label={t('extras.quantity')} error={errors.quantity}>
              <Input id="extra-qty" type="number" inputMode="numeric" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </FormField>
            <FormField id="extra-price" label={t('extras.unitPrice')} error={errors.unitPriceMad}>
              <Input id="extra-price" inputMode="decimal" dir="ltr" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </FormField>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t('common.saving') : t('extras.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
