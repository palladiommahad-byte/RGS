'use client';

import {
  EXPENSE_PAYMENT_METHODS,
  parseMadToCentimes,
  recurringFormSchema,
  type ExpenseCategoryDto,
  type ExpensePaymentMethod,
  type Paginated,
  type RecurringExpenseDto,
} from '@riad/shared';
import { Pencil, Play, Plus, Power, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { centimesToInput, formatDate, formatMoney } from '@/lib/format';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { CategoryIcon, categoryName } from './category-icon';
import { SupplierInput } from './supplier-input';

/** Recurring payments (rent, internet…) generated automatically each month. */
export function RecurringTab({ categories, onChanged }: { categories: ExpenseCategoryDto[]; onChanged: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const query = useApiQuery<Paginated<RecurringExpenseDto>>('/recurring-expenses?includeInactive=true&limit=100');
  const [editing, setEditing] = useState<RecurringExpenseDto | null | undefined>(undefined);
  const action = useAction();
  const [info, setInfo] = useState<string | null>(null);

  const refresh = () => {
    query.reload();
    onChanged();
  };

  async function runNow() {
    const res = await action.run(() => api<{ created: number }>('/recurring-expenses/run', { method: 'POST' }));
    if (res) {
      setInfo(t('recurring.generated', { count: res.created }));
      refresh();
    }
  }

  async function toggle(r: RecurringExpenseDto) {
    if (await action.run(() => api(`/recurring-expenses/${r.id}`, { method: 'PATCH', body: { isActive: !r.isActive } }))) refresh();
  }

  async function remove(r: RecurringExpenseDto) {
    if (!window.confirm(t('recurring.deleteConfirm', { label: r.label }))) return;
    if (await action.run(() => api(`/recurring-expenses/${r.id}`, { method: 'DELETE' }))) refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEditing(null)}>
          <Plus aria-hidden />
          {t('recurring.new')}
        </Button>
        <Button variant="outline" onClick={() => void runNow()} disabled={action.pending}>
          <Play aria-hidden />
          {t('recurring.runNow')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('recurring.hint')}</p>
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>}
      <FormError message={action.error} />

      <Card className="py-0">
        {query.data?.items.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">{t('recurring.empty')}</p>
        ) : (
          <ul className="divide-y">
            {query.data?.items.map((r) => (
              <li key={r.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', !r.isActive && 'opacity-60')}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border text-teal-900">
                  <CategoryIcon icon={r.category.icon} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.label}</span>
                    {!r.isActive && <Badge tone="gray">{t('recurring.paused')}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('recurring.dayOfMonth', { day: r.dayOfMonth })} · {categoryName(r.category, locale)}
                    {r.supplier && ` · ${r.supplier.name}`} · {t(`expenseMethod.${r.paymentMethod}`)}
                  </div>
                  {r.isActive && (
                    <div className="text-xs text-muted-foreground">
                      {t('recurring.next', { date: formatDate(r.nextDate, locale) })}
                      {r.lastGenerated && ` · ${t('recurring.last', { date: formatDate(r.lastGenerated, locale) })}`}
                    </div>
                  )}
                </div>
                <span className="font-semibold tabular-nums">{formatMoney(r.amount, locale)}</span>
                <div className="flex">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(r)} aria-label={t('common.edit')}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => void toggle(r)} aria-label={r.isActive ? t('recurring.pause') : t('recurring.resume')} title={r.isActive ? t('recurring.pause') : t('recurring.resume')}>
                    <Power className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(r)} aria-label={t('common.delete')}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <RecurringDialog
        open={editing !== undefined}
        recurring={editing ?? undefined}
        categories={categories}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onDone={refresh}
      />
    </div>
  );
}

const METHODS = EXPENSE_PAYMENT_METHODS.filter((m) => m !== 'PETTY_CASH');

function RecurringDialog({
  open,
  recurring,
  categories,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  recurring?: RecurringExpenseDto;
  categories: ExpenseCategoryDto[];
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [label, setLabel] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('1');
  const [method, setMethod] = useState<ExpensePaymentMethod>('TRANSFER');
  const [supplier, setSupplier] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    setLabel(recurring?.label ?? '');
    setCategoryId(recurring?.category.id ?? '');
    setAmount(recurring ? centimesToInput(recurring.amount) : '');
    setDay(String(recurring?.dayOfMonth ?? 1));
    setMethod(recurring?.paymentMethod ?? 'TRANSFER');
    setSupplier(recurring?.supplier?.name ?? '');
    setErrors({});
    setError(null);
  }, [open, recurring, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = recurringFormSchema.safeParse({ label, categoryId, amountMad: amount, dayOfMonth: day, paymentMethod: method, supplierName: supplier });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const v = parsed.data;
    const body = {
      label: v.label,
      categoryId: v.categoryId,
      amount: parseMadToCentimes(v.amountMad),
      dayOfMonth: v.dayOfMonth,
      paymentMethod: v.paymentMethod,
      supplierName: v.supplierName,
    };
    const ok = await run(() =>
      recurring
        ? api(`/recurring-expenses/${recurring.id}`, { method: 'PATCH', body })
        : api('/recurring-expenses', { method: 'POST', body }),
    );
    if (ok !== undefined) {
      onOpenChange(false);
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{recurring ? t('recurring.edit') : t('recurring.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField id="r-label" label={t('extras.label')} error={errors.label}>
            <Input id="r-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('recurring.labelPlaceholder')} />
          </FormField>
          <FormField id="r-cat" label={t('expenses.category')} error={errors.categoryId}>
            <Select id="r-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName(c, locale)}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="r-amount" label={t('payments.amount')} error={errors.amountMad}>
              <Input id="r-amount" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormField>
            <FormField id="r-day" label={t('recurring.day')} error={errors.dayOfMonth} hint={t('recurring.dayHint')}>
              <Input id="r-day" type="number" inputMode="numeric" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
            </FormField>
          </div>
          <FormField id="r-method" label={t('expenses.method')}>
            <Select id="r-method" value={method} onChange={(e) => setMethod(e.target.value as ExpensePaymentMethod)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`expenseMethod.${m}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="r-supplier" label={t('expenses.supplier')}>
            <SupplierInput id="r-supplier" value={supplier} onChange={setSupplier} onPick={(s) => s.defaultCategoryId && setCategoryId(s.defaultCategoryId)} />
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
