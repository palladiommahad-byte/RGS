'use client';

import {
  EXPENSE_PAYMENT_METHODS,
  expenseFormSchema,
  parseMadToCentimes,
  todayIso,
  type CashWalletDto,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type ExpensePaymentMethod,
} from '@riad/shared';
import { Camera, ChevronDown, FileText, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, apiUpload } from '@/lib/api';
import { centimesToInput, formatMoney } from '@/lib/format';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { compressImage } from '@/lib/image';
import { useAction } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { CategoryIcon, categoryName } from './category-icon';
import { SupplierInput } from './supplier-input';

type Receipt = { blob: Blob; name: string; preview: string | null };

/**
 * Quick add (target: under 10 seconds): amount, tap a category, optional supplier and
 * receipt photo, save. Edit mode reuses the same form for managers.
 */
export function ExpenseDialog({
  open,
  onOpenChange,
  onSaved,
  categories,
  wallets,
  expense,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  categories: ExpenseCategoryDto[];
  wallets: CashWalletDto[];
  expense?: ExpenseDto;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { can } = useAuth();
  const full = can('expenses.write');
  const activeWallets = wallets.filter((w) => w.isActive);
  const fileRef = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [more, setMore] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [tva, setTva] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<ExpensePaymentMethod>('CASH');
  const [walletId, setWalletId] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setError(null);
    setReceipt(null);
    if (expense) {
      setAmount(centimesToInput(expense.amountTtc));
      setCategoryId(expense.category.id);
      setSupplier(expense.supplier?.name ?? '');
      setDate(expense.date);
      setTva(expense.tvaAmount ? centimesToInput(expense.tvaAmount) : '');
      setNote(expense.note ?? '');
      setMethod(expense.paymentMethod);
      setWalletId(expense.wallet?.id ?? '');
      setMore(true);
    } else {
      setAmount('');
      setCategoryId('');
      setSupplier('');
      setDate(todayIso());
      setTva('');
      setNote('');
      setMethod(full ? 'CASH' : 'PETTY_CASH');
      setWalletId(activeWallets[0]?.id ?? '');
      setMore(false);
    }
    // Reset only when the dialog opens.
  }, [open]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.type === 'application/pdf') return setReceipt({ blob: file, name: file.name, preview: null });
    const blob = await compressImage(file);
    setReceipt({ blob, name: 'receipt.jpg', preview: URL.createObjectURL(blob) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = expenseFormSchema.safeParse({
      amountMad: amount,
      categoryId,
      supplierName: supplier,
      date,
      tvaMad: tva,
      note,
      paymentMethod: method,
      walletId: method === 'PETTY_CASH' ? walletId : undefined,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const v = parsed.data;
    const body = {
      amountTtc: parseMadToCentimes(v.amountMad),
      tvaAmount: v.tvaMad ? parseMadToCentimes(v.tvaMad) : 0,
      categoryId: v.categoryId,
      supplierName: v.supplierName,
      date: v.date,
      note: v.note,
      ...(expense ? {} : full ? { paymentMethod: v.paymentMethod, walletId: v.walletId } : {}),
    };
    const saved = await run(async () => {
      const row = expense
        ? await api<ExpenseDto>(`/expenses/${expense.id}`, { method: 'PATCH', body })
        : await api<ExpenseDto>('/expenses', { method: 'POST', body });
      if (receipt) {
        const form = new FormData();
        form.set('file', receipt.blob, receipt.name);
        await apiUpload(`/expenses/${row.id}/receipt`, form);
      }
      return row;
    });
    if (saved) {
      onOpenChange(false);
      onSaved();
    }
  }

  const wallet = activeWallets.find((w) => w.id === walletId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{expense ? t('expenses.edit') : t('expenses.quickAdd')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField id="exp-amount" label={t('expenses.amount')} error={errors.amountMad}>
            <div className="relative" dir="ltr">
              <Input
                id="exp-amount"
                inputMode="decimal"
                autoFocus
                placeholder="0,00"
                className="h-16 pe-16 text-3xl font-semibold tracking-tight"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!!errors.amountMad}
              />
              <span className="absolute end-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">MAD</span>
            </div>
          </FormField>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t('expenses.category')}</legend>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  aria-pressed={categoryId === c.id}
                  className={cn(
                    'flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-lg border p-1.5 text-center text-[11px] leading-tight font-medium transition-colors',
                    categoryId === c.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
                  )}
                >
                  <CategoryIcon icon={c.icon} className="size-5 shrink-0" />
                  <span className="line-clamp-2">{categoryName(c, locale)}</span>
                </button>
              ))}
            </div>
            {errors.categoryId && <p className="mt-2 text-sm text-destructive">{t('expenses.pickCategory')}</p>}
          </fieldset>

          <FormField id="exp-supplier" label={t('expenses.supplier')}>
            <SupplierInput
              id="exp-supplier"
              value={supplier}
              onChange={setSupplier}
              onPick={(s) => s.defaultCategoryId && setCategoryId(s.defaultCategoryId)}
              placeholder={t('expenses.supplierPlaceholder')}
            />
          </FormField>

          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {receipt ? (
            <div className="flex items-center gap-3 rounded-lg border p-2">
              {receipt.preview ? (
                <img src={receipt.preview} alt="" className="size-14 rounded-md object-cover" />
              ) : (
                <FileText className="size-8 text-muted-foreground" aria-hidden />
              )}
              <span className="flex-1 text-sm">{t('expenses.receiptAttached')}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => setReceipt(null)} aria-label={t('common.delete')}>
                <X />
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Camera aria-hidden />
              {expense?.hasReceipt ? t('expenses.replaceReceipt') : t('expenses.addReceipt')}
            </Button>
          )}

          {!full && wallet && (
            <p className="rounded-lg bg-teal-100/60 px-3 py-2 text-sm text-teal-900">
              {t('expenses.fromWallet', { wallet: wallet.name, balance: formatMoney(wallet.balance, locale) })}
            </p>
          )}

          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            className="flex min-h-10 items-center gap-1 self-start text-sm font-medium text-teal-900"
            aria-expanded={more}
          >
            <ChevronDown className={cn('size-4 transition-transform', more && 'rotate-180')} aria-hidden />
            {t('expenses.moreOptions')}
          </button>
          {more && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="exp-date" label={t('expenses.date')} error={errors.date}>
                <Input id="exp-date" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
              </FormField>
              <FormField id="exp-tva" label={t('expenses.tva')} error={errors.tvaMad} hint={t('expenses.tvaHint')}>
                <Input id="exp-tva" inputMode="decimal" dir="ltr" value={tva} onChange={(e) => setTva(e.target.value)} />
              </FormField>
              {full && !expense && (
                <FormField id="exp-method" label={t('expenses.method')}>
                  <Select id="exp-method" value={method} onChange={(e) => setMethod(e.target.value as ExpensePaymentMethod)}>
                    {EXPENSE_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {t(`expenseMethod.${m}`)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              {full && !expense && method === 'PETTY_CASH' && (
                <FormField id="exp-wallet" label={t('expenses.wallet')} error={errors.walletId}>
                  <Select id="exp-wallet" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
                    {activeWallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} — {w.holder.name} ({formatMoney(w.balance, locale)})
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              <FormField id="exp-note" label={t('expenses.note')} className="sm:col-span-2">
                <Input id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </FormField>
            </div>
          )}

          <FormError message={error} />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? t('common.saving') : t('common.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
