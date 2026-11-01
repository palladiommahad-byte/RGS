'use client';

import {
  addDays,
  addMonths,
  monthStartOf,
  todayIso,
  type CashWalletDto,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type ExpenseListDto,
  type Paginated,
  type SupplierDto,
} from '@riad/shared';
import { Landmark, Paperclip, Pencil, Receipt, Repeat, Trash2, Users, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CHART_COLORS } from '@/components/finance/charts';
import { FormError } from '@/components/form-field';
import { Pagination } from '@/components/pagination';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { useAction, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { CategoryIcon, categoryName } from './category-icon';
import { ExpenseDialog } from './expense-dialog';

const LIMIT = 25;
type Preset = 'month' | 'lastMonth' | 'last30' | 'all' | 'custom';
const PRESETS: Preset[] = ['month', 'lastMonth', 'last30', 'all', 'custom'];

function presetRange(p: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const today = todayIso();
  if (p === 'month') return { from: monthStartOf(today), to: '' };
  if (p === 'lastMonth') return { from: addMonths(today, -1), to: addDays(monthStartOf(today), -1) };
  if (p === 'last30') return { from: addDays(today, -29), to: '' };
  return { from: '', to: '' };
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
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ExpenseDto | undefined>();
  const action = useAction();

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  if (categoryId) params.set('categoryId', categoryId);
  if (supplierId) params.set('supplierId', supplierId);
  if (createdBy) params.set('createdBy', createdBy);
  const query = useApiQuery<ExpenseListDto>(`/expenses?${params.toString()}`);
  const suppliers = useApiQuery<Paginated<SupplierDto>>(manager ? '/suppliers?limit=100' : null);
  const creators = useApiQuery<{ id: string; name: string }[]>(manager ? '/expenses/creators' : null);
  const { reload } = query;
  useEffect(() => {
    if (version > 0) reload();
  }, [version, reload]);

  const m = (c: number) => formatMoney(c, locale);
  const d = query.data;
  // One colour per category, stable across filters (order of the category list).
  const colorOf = (id: string) => CHART_COLORS[Math.max(0, categories.findIndex((c) => c.id === id)) % CHART_COLORS.length]!;
  const category = (id: string) => categories.find((c) => c.id === id);
  const set = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };

  function choose(p: Preset) {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
    setPage(1);
  }

  async function remove(e: ExpenseDto) {
    if (!window.confirm(t('expenses.deleteConfirm', { amount: m(e.amountTtc) }))) return;
    if (await action.run(() => api(`/expenses/${e.id}`, { method: 'DELETE' }))) onChanged();
  }

  // Group the page by day, newest first (the API already sorts by date).
  const days: { date: string; items: ExpenseDto[] }[] = [];
  for (const e of d?.items ?? []) {
    const last = days[days.length - 1];
    if (last?.date === e.date) last.items.push(e);
    else days.push({ date: e.date, items: [e] });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t('expenses.period')}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={preset === p}
                onClick={() => choose(p)}
                className={cn(
                  'h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                  preset === p ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
                )}
              >
                {p === 'all' ? t('expenses.allTime') : t(`finance.preset.${p}`)}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex gap-2">
              <Input type="date" aria-label={t('register.from')} value={range.from} onChange={(e) => set((v) => setRange((r) => ({ ...r, from: v })))(e.target.value)} className="w-40" />
              <Input type="date" aria-label={t('register.to')} value={range.to} onChange={(e) => set((v) => setRange((r) => ({ ...r, to: v })))(e.target.value)} className="w-40" />
            </div>
          )}
        </div>
        <div className={cn('grid gap-2', manager ? 'sm:grid-cols-3' : 'sm:grid-cols-1 sm:max-w-xs')}>
          <Select aria-label={t('expenses.category')} value={categoryId} onChange={(e) => set(setCategoryId)(e.target.value)}>
            <option value="">{t('expenses.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryName(c, locale)}
              </option>
            ))}
          </Select>
          {manager && (
            <>
              <Select aria-label={t('expenses.supplier')} value={supplierId} onChange={(e) => set(setSupplierId)(e.target.value)}>
                <option value="">{t('expenses.allSuppliers')}</option>
                {suppliers.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select aria-label={t('expenses.enteredBy')} value={createdBy} onChange={(e) => set(setCreatedBy)(e.target.value)}>
                <option value="">{t('expenses.allUsers')}</option>
                {creators.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </>
          )}
        </div>
      </div>

      {d && (
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)]">
          <StatCard highlight icon={Wallet} label={t('expenses.periodTotalLabel')} value={m(d.sumTtc)} footnote={t('expenses.inclVat')} />
          <StatCard tone="violet" icon={Landmark} label={t('expenses.recoverableVat')} value={m(d.sumTva)} footnote={t('expenses.recoverableVatHint')} />
          <StatCard tone="sky" icon={Receipt} label={t('expenses.count')} value={d.total} footnote={t('common.results', { count: d.total })} />
          <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-5 sm:col-span-3 xl:col-span-1">
            <span className="text-sm font-medium">{t('finance.expensesByCategory')}</span>
            {d.byCategory.length === 0 ? (
              <span className="text-sm text-muted-foreground">{t('expenses.empty')}</span>
            ) : (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                  {d.byCategory.map((c) => (
                    <span key={c.categoryId} style={{ width: `${(c.amount / Math.max(1, d.sumTtc)) * 100}%`, background: colorOf(c.categoryId) }} />
                  ))}
                </div>
                <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  {d.byCategory.slice(0, 6).map((c) => {
                    const cat = category(c.categoryId);
                    return (
                      <li key={c.categoryId}>
                        <button
                          type="button"
                          onClick={() => set(setCategoryId)(categoryId === c.categoryId ? '' : c.categoryId)}
                          className={cn('flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-start hover:bg-accent', categoryId === c.categoryId && 'bg-accent')}
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(c.categoryId) }} aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{cat ? categoryName(cat, locale) : '—'}</span>
                          <span className="font-medium tabular-nums">{Math.round((c.amount / Math.max(1, d.sumTtc)) * 100)} %</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
      <FormError message={action.error} />

      {d?.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">{t('expenses.empty')}</p>
      ) : (
        <div className={cn('flex flex-col gap-4', query.loading && 'opacity-60')}>
          {days.map((day) => (
            <section key={day.date} className="overflow-hidden rounded-2xl border bg-card">
              <header className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5 text-sm">
                <span className="inline-block font-medium first-letter:uppercase">{formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                <span className="font-semibold tabular-nums">{m(day.items.reduce((n, e) => n + e.amountTtc, 0))}</span>
              </header>
              <ul className="divide-y">
                {day.items.map((e) => {
                  const color = colorOf(e.category.id);
                  const editable = can('expenses.write') && e.source !== 'PAYROLL';
                  return (
                    <li key={e.id} className="group flex items-center gap-3 px-4 py-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}1f`, color }}>
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
                          {e.source === 'PAYROLL' && (
                            <Badge tone="teal">
                              <Users className="size-3" aria-hidden />
                              {t('expenses.payrollBadge')}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>{categoryName(e.category, locale)}</span>
                          <span aria-hidden>·</span>
                          <span>{e.wallet ? e.wallet.name : t(`expenseMethod.${e.paymentMethod}`)}</span>
                          {e.createdBy && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{e.createdBy.name}</span>
                            </>
                          )}
                          {e.note && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="truncate italic">{e.note}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="font-semibold tabular-nums">{m(e.amountTtc)}</div>
                        {e.tvaAmount > 0 && <div className="text-[11px] text-muted-foreground tabular-nums">{t('expenses.vatIncluded', { amount: m(e.tvaAmount) })}</div>}
                      </div>
                      <div className="flex shrink-0">
                        {e.hasReceipt && (
                          <Button variant="ghost" size="icon" className="size-9" onClick={() => void action.run(() => openSigned(`/expenses/${e.id}/receipt`))} aria-label={t('expenses.viewReceipt')} title={t('expenses.viewReceipt')}>
                            <Paperclip className="size-4" />
                          </Button>
                        )}
                        {editable && (
                          <>
                            <Button variant="ghost" size="icon" className="size-9" onClick={() => setEditing(e)} aria-label={t('common.edit')} title={t('common.edit')}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-9 text-destructive hover:text-destructive" onClick={() => void remove(e)} aria-label={t('common.delete')} title={t('common.delete')}>
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {d && <Pagination page={page} limit={LIMIT} total={d.total} onPage={setPage} />}

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
