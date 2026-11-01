'use client';

import { addDays, localDate, monthStartOf, PAYMENT_METHODS, todayIso, type PaymentListItemDto, type PaymentMethod, type PaymentsReportDto } from '@riad/shared';
import { Banknote, ChevronRight, CreditCard, Globe, Landmark, Wallet, type LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { StatCard, type StatTone } from '@/components/stat-card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Link } from '@/i18n/navigation';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const LIMIT = 30;
type Preset = 'today' | 'yesterday' | 'last7' | 'month' | 'custom';
const PRESETS: Preset[] = ['today', 'yesterday', 'last7', 'month', 'custom'];

function presetRange(p: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const today = todayIso();
  if (p === 'today') return { from: today, to: today };
  if (p === 'yesterday') return { from: addDays(today, -1), to: addDays(today, -1) };
  if (p === 'last7') return { from: addDays(today, -6), to: today };
  return { from: monthStartOf(today), to: today };
}

const METHOD_STYLE: Record<PaymentMethod, { icon: LucideIcon; className: string }> = {
  CASH: { icon: Banknote, className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  CARD: { icon: CreditCard, className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  TRANSFER: { icon: Landmark, className: 'bg-violet-50 text-violet-700 ring-violet-200' },
  OTA_COLLECTED: { icon: Globe, className: 'bg-amber-50 text-amber-800 ring-amber-200' },
};

const METHOD_TONE: Record<PaymentMethod, StatTone> = { CASH: 'emerald', CARD: 'sky', TRANSFER: 'violet', OTA_COLLECTED: 'amber' };

/** Guest payments over a period: who paid, how, to whom — and what should be in the drawer. */
export default function PaymentsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { can } = useAuth();
  const allowed = can('finance.reports', 'payments.write');
  const [preset, setPreset] = useState<Preset>('today');
  const [range, setRange] = useState(() => presetRange('today'));
  const [method, setMethod] = useState<PaymentMethod | 'ALL'>('ALL');
  const [person, setPerson] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  if (method !== 'ALL') params.set('method', method);
  if (person) params.set('receivedBy', person);
  const query = useApiQuery<PaymentsReportDto>(allowed ? `/payments?${params}` : null);
  useRealtimeEvent('stays:changed', query.reload);

  if (!allowed) return <p className="text-muted-foreground">{t('dashboard.forbidden')}</p>;

  const r = query.data;
  const m = (c: number) => formatMoney(c, locale);
  const setDay = (key: 'from' | 'to', value: string) => {
    setRange((x) => ({ ...x, [key]: value }));
    setPage(1);
  };
  const choose = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
    setPage(1);
  };

  // Newest first, grouped by riad-local day.
  const days: { day: string; items: PaymentListItemDto[]; sum: number }[] = [];
  for (const it of r?.items ?? []) {
    const day = localDate(new Date(it.paidAt));
    if (days.at(-1)?.day !== day) days.push({ day, items: [], sum: 0 });
    days.at(-1)!.items.push(it);
    days.at(-1)!.sum += it.amount;
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('nav.payments')} subtitle={t('paymentsPage.subtitle')} />

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
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
              {t(`paymentsPage.preset.${p}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('paymentsPage.method')}</span>
            <Select value={method} onChange={(e) => {
              setMethod(e.target.value as PaymentMethod | 'ALL');
              setPage(1);
            }} className="h-11">
              <option value="ALL">{t('paymentsPage.allMethods')}</option>
              {PAYMENT_METHODS.map((pm) => (
                <option key={pm} value={pm}>
                  {t(`paymentMethod.${pm}`)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('paymentsPage.receivedBy')}</span>
            <Select value={person} onChange={(e) => {
              setPerson(e.target.value);
              setPage(1);
            }} className="h-11">
              <option value="">{t('audit.everyone')}</option>
              {r?.receivers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </label>
          {preset === 'custom' && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">{t('audit.from')}</span>
                <Input type="date" value={range.from} max={range.to || undefined} onChange={(e) => setDay('from', e.target.value)} className="h-11" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">{t('audit.to')}</span>
                <Input type="date" value={range.to} min={range.from || undefined} onChange={(e) => setDay('to', e.target.value)} className="h-11" />
              </label>
            </>
          )}
        </div>
      </div>

      {r && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            highlight
            className="col-span-2 min-h-0 lg:col-span-4"
            icon={Wallet}
            label={t('paymentsPage.total')}
            value={m(r.totals.all)}
            footnote={t('paymentsPage.count', { count: r.totals.count })}
          />
          {PAYMENT_METHODS.map((pm) => {
            const Icon = METHOD_STYLE[pm].icon;
            return (
              <button
                key={pm}
                type="button"
                onClick={() => {
                  setMethod(method === pm ? 'ALL' : pm);
                  setPage(1);
                }}
                aria-pressed={method === pm}
                className={cn('min-w-0 rounded-xl text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', method === pm && 'ring-2 ring-primary')}
              >
                <StatCard tone={METHOD_TONE[pm]} icon={Icon} label={t(`paymentMethod.${pm}`)} value={<Amount value={m(r.totals[pm])} />} className="h-full" />
              </button>
            );
          })}
        </div>
      )}

      {r && <p className="text-sm text-muted-foreground">{t('common.results', { count: r.total })}</p>}

      {r?.items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">{t('paymentsPage.empty')}</p>
      ) : (
        <div className={cn('flex flex-col gap-5', query.loading && 'opacity-60')}>
          {days.map(({ day, items, sum }) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="flex items-baseline justify-between gap-2 text-sm font-semibold text-muted-foreground">
                <span className="first-letter:uppercase">{formatDate(day, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span className="tabular-nums">{m(sum)}</span>
              </h2>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {items.map((p) => {
                  const style = METHOD_STYLE[p.method];
                  return (
                    <li key={p.id}>
                      <Link href={`/dashboard/stays/${p.stay.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
                        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full ring-1', style.className)} aria-hidden>
                          <style.icon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {p.stay.guestName ?? t('calendar.noGuestYet')}
                            {p.stay.roomName && <span className="font-normal text-muted-foreground"> · {p.stay.roomName}</span>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[t(`paymentMethod.${p.method}`), p.receivedBy && t('payments.receivedBy', { name: p.receivedBy.name }), p.note].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end">
                          <span className="font-semibold tabular-nums">{m(p.amount)}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">{formatTime(p.paidAt, locale)}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {query.error && (
        <p role="alert" className="text-sm text-destructive">
          {t('errors.generic')}
        </p>
      )}

      {r && <Pagination page={page} limit={LIMIT} total={r.total} onPage={setPage} />}
    </div>
  );
}

/** Method amounts sized to stay on one line in four columns. */
function Amount({ value }: { value: string }) {
  return <span className="block text-base whitespace-nowrap sm:text-xl 2xl:text-2xl">{value}</span>;
}
