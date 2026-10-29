'use client';

import type { CashWalletDto, ExpenseCategoryDto, ExpenseDto, ExpenseListDto, Paginated, SupplierDto } from '@riad/shared';
import { Paperclip, Pencil, Repeat, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { FormError, FormField } from '@/components/form-field';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { useAction, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { CategoryIcon, categoryName } from './category-icon';
import { ExpenseDialog } from './expense-dialog';

const LIMIT = 25;

export function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Opens a signed link in a new tab (opened first so popup blockers allow it). */
async function openSigned(path: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const { url } = await api<{ url: string }>(path);
    if (tab) tab.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}

export function ExpensesTab({
  categories,
  wallets,
  version,
  onChanged,
}: {
  categories: ExpenseCategoryDto[];
  wallets: CashWalletDto[];
  version: number;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { can } = useAuth();
  const manager = can('expenses.read_all');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ExpenseDto | undefined>();
  const action = useAction();

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (categoryId) params.set('categoryId', categoryId);
  if (supplierId) params.set('supplierId', supplierId);
  if (createdBy) params.set('createdBy', createdBy);
  const query = useApiQuery<ExpenseListDto>(`/expenses?${params.toString()}`);
  const suppliers = useApiQuery<Paginated<SupplierDto>>(manager ? '/suppliers?limit=100' : null);
  const { reload } = query;
  useEffect(() => {
    if (version > 0) reload();
  }, [version, reload]);
  const creators = useApiQuery<{ id: string; name: string }[]>(manager ? '/expenses/creators' : null);
  const m = (c: number) => formatMoney(c, locale);
  const filter = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    set(e.target.value);
    setPage(1);
  };

  async function remove(e: ExpenseDto) {
    if (!window.confirm(t('expenses.deleteConfirm', { amount: m(e.amountTtc) }))) return;
    if (await action.run(() => api(`/expenses/${e.id}`, { method: 'DELETE' }))) onChanged();
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <FormField id="f-from" label={t('register.from')}>
            <Input id="f-from" type="date" value={from} onChange={filter(setFrom)} />
          </FormField>
          <FormField id="f-to" label={t('register.to')}>
            <Input id="f-to" type="date" value={to} onChange={filter(setTo)} />
          </FormField>
          <FormField id="f-cat" label={t('expenses.category')}>
            <Select id="f-cat" value={categoryId} onChange={filter(setCategoryId)}>
              <option value="">{t('stays.all')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName(c, locale)}
                </option>
              ))}
            </Select>
          </FormField>
          {manager && (
            <>
              <FormField id="f-sup" label={t('expenses.supplier')}>
                <Select id="f-sup" value={supplierId} onChange={filter(setSupplierId)}>
                  <option value="">{t('stays.all')}</option>
                  {suppliers.data?.items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="f-user" label={t('expenses.enteredBy')}>
                <Select id="f-user" value={createdBy} onChange={filter(setCreatedBy)}>
                  <option value="">{t('stays.all')}</option>
                  {creators.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </>
          )}
        </CardContent>
      </Card>

      {query.data && (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground">{t('common.results', { count: query.data.total })}</span>
          <span className="text-lg font-semibold">
            {t('expenses.periodTotal')} <span className="tabular-nums">{m(query.data.sumTtc)}</span>
          </span>
        </div>
      )}
      <FormError message={action.error} />

      <Card className="py-0">
        {query.data?.items.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">{t('expenses.empty')}</p>
        ) : (
          <ul className={cn('divide-y', query.loading && 'opacity-60')}>
            {query.data?.items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border text-teal-900">
                  <CategoryIcon icon={e.category.icon} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{e.supplier?.name ?? categoryName(e.category, locale)}</span>
                    {e.source === 'RECURRING' && (
                      <Badge tone="teal">
                        <Repeat className="size-3" aria-hidden />
                        {t('expenses.recurringBadge')}
                      </Badge>
                    )}
                    {e.source === 'PAYROLL' && <Badge tone="teal">{t('expenses.payrollBadge')}</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatDate(e.date, locale, { day: 'numeric', month: 'short' })} · {categoryName(e.category, locale)} ·{' '}
                    {e.wallet ? e.wallet.name : t(`expenseMethod.${e.paymentMethod}`)}
                    {e.createdBy && ` · ${e.createdBy.name}`}
                    {e.note && ` · ${e.note}`}
                  </div>
                </div>
                <span className="font-semibold tabular-nums">{m(e.amountTtc)}</span>
                <div className="flex shrink-0">
                  {e.hasReceipt && (
                    <Button variant="ghost" size="icon" onClick={() => void action.run(() => openSigned(`/expenses/${e.id}/receipt`))} aria-label={t('expenses.viewReceipt')} title={t('expenses.viewReceipt')}>
                      <Paperclip className="size-4" />
                    </Button>
                  )}
                  {can('expenses.write') && e.source !== 'PAYROLL' && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(e)} aria-label={t('common.edit')}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(e)} aria-label={t('common.delete')}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {query.data && <Pagination page={page} limit={LIMIT} total={query.data.total} onPage={setPage} />}

      <ExpenseDialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onSaved={onChanged}
        categories={categories}
        wallets={wallets}
        expense={editing}
      />
    </div>
  );
}
