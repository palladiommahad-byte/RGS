'use client';

import {
  addDays,
  CASH_MOVEMENT_TYPES,
  categoryLabel,
  localDate,
  monthStartOf,
  todayIso,
  type CashBoxReportDto,
  type CashMovementDto,
  type CashMovementType,
  type CashWalletDto,
  type ExpenseCategoryDto,
} from '@riad/shared';
import { ArrowDownLeft, ArrowUpRight, Banknote, ChevronRight, Plus, Receipt, Scale, Wallet, type LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AmountDialog } from '@/components/expenses/amount-dialog';
import { ExpenseDialog } from '@/components/expenses/expense-dialog';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const LIMIT = 30;
type Preset = 'today' | 'last7' | 'month' | 'all';
const PRESETS: Preset[] = ['today', 'last7', 'month', 'all'];

function presetRange(p: Preset): { from: string; to: string } {
  const today = todayIso();
  if (p === 'today') return { from: today, to: today };
  if (p === 'last7') return { from: addDays(today, -6), to: today };
  if (p === 'month') return { from: monthStartOf(today), to: today };
  return { from: '', to: '' };
}

const TYPE_STYLE: Record<CashMovementType, { icon: LucideIcon; className: string }> = {
  PAYMENT: { icon: Banknote, className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  TOP_UP: { icon: ArrowDownLeft, className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  EXPENSE: { icon: Receipt, className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  ADJUSTMENT: { icon: Scale, className: 'bg-violet-50 text-violet-700 ring-violet-200' },
};

/** The cash box at a glance: balance, what came in and went out, every movement. */
export default function CashBoxPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { can } = useAuth();
  const allowed = can('expenses.write', 'expenses.write_petty_cash');
  const manager = can('expenses.write');
  const wallets = useApiQuery<CashWalletDto[]>(allowed ? '/cash-wallets' : null);
  const categories = useApiQuery<ExpenseCategoryDto[]>(allowed ? '/expense-categories' : null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('today');
  const [type, setType] = useState<CashMovementType | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<'topup' | 'adjust' | 'expense' | null>(null);

  const boxes = (wallets.data ?? []).filter((w) => w.isActive);
  const box = boxes.find((w) => w.id === chosen) ?? boxes[0];
  const range = presetRange(preset);
  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  if (type !== 'ALL') params.set('type', type);
  const report = useApiQuery<CashBoxReportDto>(box ? `/cash-wallets/${box.id}/movements?${params}` : null);
  const reload = () => {
    wallets.reload();
    report.reload();
  };
  // Every movement sends a notification: refresh when one happens (other screens too).
  useRealtimeEvent('notifications:changed', reload);

  if (!allowed) return <p className="text-muted-foreground">{t('dashboard.forbidden')}</p>;
  const m = (c: number) => formatMoney(c, locale);
  const r = report.data;

  if (wallets.data && !box) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t('nav.cashBox')} subtitle={t('cashBox.subtitle')} />
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card p-10 text-center">
          <Wallet className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-muted-foreground">{t('cashBox.none')}</p>
          {manager && (
            <Button asChild>
              <Link href="/dashboard/expenses?tab=wallets">{t('cashBox.create')}</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Newest first, grouped by riad-local day.
  const days: { day: string; items: CashMovementDto[] }[] = [];
  for (const mv of r?.items ?? []) {
    const day = localDate(new Date(mv.createdAt));
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(mv);
  }

  const move = (path: 'top-up' | 'adjust') => (amount: number, note: string | undefined) =>
    api(`/cash-wallets/${box!.id}/${path}`, { method: 'POST', body: { amount, note } }).then(reload);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('nav.cashBox')}
        subtitle={t('cashBox.subtitle')}
        actions={
          manager && (
            <Button asChild variant="outline">
              <Link href="/dashboard/expenses?tab=wallets">{t('cashBox.manage')}</Link>
            </Button>
          )
        }
      />

      {boxes.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
          {boxes.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={box?.id === w.id}
              onClick={() => {
                setChosen(w.id);
                setPage(1);
              }}
              className={cn(
                'h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                box?.id === w.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {w.name}
            </button>
          ))}
        </div>
      )}

      {box && (
        <div className="flex flex-col gap-4 rounded-2xl bg-primary p-5 text-primary-foreground sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/15" aria-hidden>
              <Wallet className="size-6" />
            </span>
            <div>
              <div className="font-medium">{box.name}</div>
              <div className="text-sm text-white/75">{box.holder.name}</div>
              <div className="mt-3 text-sm text-white/75">{t('wallets.balance')}</div>
              <div className="text-4xl font-semibold tracking-tight tabular-nums">{m(box.balance)}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {manager && (
              <>
                <Button variant="secondary" onClick={() => setDialog('topup')}>
                  <ArrowDownLeft aria-hidden />
                  {t('wallets.topUp')}
                </Button>
                <Button variant="secondary" onClick={() => setDialog('adjust')}>
                  <Scale aria-hidden />
                  {t('wallets.adjust')}
                </Button>
              </>
            )}
            {categories.data && (
              <Button variant="secondary" onClick={() => setDialog('expense')}>
                <Plus aria-hidden />
                {t('cashBox.spend')}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={preset === p}
              onClick={() => {
                setPreset(p);
                setPage(1);
              }}
              className={cn(
                'h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                preset === p ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {t(`cashBox.preset.${p}`)}
            </button>
          ))}
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {(['ALL', ...CASH_MOVEMENT_TYPES] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={type === k}
              onClick={() => {
                setType(k);
                setPage(1);
              }}
              className={cn(
                'h-9 shrink-0 rounded-full px-3 text-sm font-medium transition-colors',
                type === k ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              {k === 'ALL' ? t('cashBox.allMovements') : t(`cashBox.type.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {r && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard tone="emerald" icon={ArrowDownLeft} label={t('cashBox.in')} value={<span className="text-emerald-700">+{m(r.totals.in)}</span>} footnote={t('cashBox.inHint', { guests: m(r.totals.byType.PAYMENT) })} />
          <StatCard tone="rose" icon={ArrowUpRight} label={t('cashBox.out')} value={<span>−{m(r.totals.out)}</span>} footnote={t('cashBox.outHint')} />
          <StatCard icon={Scale} label={t('cashBox.net')} value={m(r.totals.in - r.totals.out)} footnote={t(`cashBox.preset.${preset}`)} />
        </div>
      )}

      {r?.items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">{t('wallets.noMovements')}</p>
      ) : (
        <div className={cn('flex flex-col gap-5', report.loading && 'opacity-60')}>
          {days.map(({ day, items }) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground first-letter:uppercase">
                {formatDate(day, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h2>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {items.map((mv) => (
                  <li key={mv.id}>
                    <MovementRow mv={mv} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {r && <Pagination page={page} limit={LIMIT} total={r.total} onPage={setPage} />}

      {box && (
        <>
          <AmountDialog
            open={dialog === 'topup'}
            onOpenChange={(o) => setDialog(o ? 'topup' : null)}
            title={t('wallets.topUpTitle', { name: box.holder.name })}
            onSubmit={move('top-up')}
          />
          <AmountDialog
            open={dialog === 'adjust'}
            onOpenChange={(o) => setDialog(o ? 'adjust' : null)}
            title={t('wallets.adjustTitle')}
            description={t('wallets.adjustHint')}
            signed
            noteRequired
            onSubmit={move('adjust')}
          />
          {categories.data && (
            <ExpenseDialog
              open={dialog === 'expense'}
              onOpenChange={(o) => setDialog(o ? 'expense' : null)}
              onSaved={reload}
              categories={categories.data}
              wallets={[box]}
              fromWallet
            />
          )}
        </>
      )}
    </div>
  );
}

function MovementRow({ mv }: { mv: CashMovementDto }) {
  const t = useTranslations();
  const locale = useLocale();
  const style = TYPE_STYLE[mv.type];
  const title = mv.payment
    ? [mv.payment.guestName, mv.payment.roomName].filter(Boolean).join(' · ') || t('cashBox.type.PAYMENT')
    : mv.expense
      ? (mv.expense.supplier ?? categoryLabel({ key: mv.expense.categoryKey, nameFr: mv.expense.category, nameAr: mv.expense.category }, locale))
      : t(`cashBox.type.${mv.type}`);
  const detail = [t(`cashBox.type.${mv.type}`), mv.createdBy && t('payments.receivedBy', { name: mv.createdBy.name }), mv.note].filter(Boolean).join(' · ');
  const content = (
    <>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full ring-1', style.className)} aria-hidden>
        <style.icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className={cn('font-semibold tabular-nums', mv.amount >= 0 ? 'text-emerald-700' : 'text-foreground')}>
          {mv.amount > 0 ? '+' : mv.amount < 0 ? '−' : ''}
          {formatMoney(Math.abs(mv.amount), locale)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatTime(mv.createdAt, locale)} · {t('cashBox.after', { amount: formatMoney(mv.balanceAfter, locale) })}
        </span>
      </span>
    </>
  );
  return mv.payment ? (
    <Link href={`/dashboard/stays/${mv.payment.stayId}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
      {content}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
    </Link>
  ) : (
    <div className="flex items-center gap-3 px-4 py-3">{content}</div>
  );
}
