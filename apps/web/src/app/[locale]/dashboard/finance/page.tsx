'use client';

import {
  addDays,
  addMonths,
  categoryLabel,
  monthStartOf,
  percentChange,
  todayIso,
  type FinanceDashboardDto,
  type IsoDate,
  type PeriodMetricsDto,
} from '@riad/shared';
import {
  BedDouble,
  CircleDollarSign,
  FileSpreadsheet,
  FileText,
  Moon,
  Percent,
  PiggyBank,
  Receipt,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { DonutChart, HorizontalBars, RevenueExpensesChart } from '@/components/finance/charts';
import { FormError } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiDownload } from '@/lib/api';
import { formatDate, formatMoney, intlLocale } from '@/lib/format';
import { useAction, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

type Preset = 'today' | 'month' | 'lastMonth' | 'last30' | 'custom';

function presetRange(p: Exclude<Preset, 'custom'>): { from: IsoDate; to: IsoDate } {
  const today = todayIso();
  switch (p) {
    case 'today':
      return { from: today, to: today };
    case 'month':
      return { from: monthStartOf(today), to: today };
    case 'lastMonth': {
      const from = addMonths(today, -1);
      return { from, to: addDays(monthStartOf(today), -1) };
    }
    case 'last30':
      return { from: addDays(today, -29), to: today };
  }
}

export default function FinancePage() {
  const t = useTranslations('finance');
  const tc = useTranslations();
  const locale = useLocale();
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const valid = range.from && range.to && range.to >= range.from;
  const query = useApiQuery<FinanceDashboardDto>(valid ? `/finance/dashboard?from=${range.from}&to=${range.to}` : null);
  const exporting = useAction();
  const d = query.data;
  const m = (c: number | null) => (c === null ? '—' : formatMoney(c, locale));
  const pct = (v: number | null) =>
    v === null ? '—' : new Intl.NumberFormat(intlLocale(locale), { style: 'percent', maximumFractionDigits: 1 }).format(v);

  function choose(p: Preset) {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  }

  /** "+12 % vs période précédente", coloured by whether up is good. */
  const delta = (key: keyof PeriodMetricsDto, upIsGood = true, onDark = false) => {
    if (!d) return undefined;
    const change = percentChange(d.current[key] as number | null, d.previous[key] as number | null);
    if (change === null) return t('noComparison');
    const good = change === 0 ? null : change > 0 === upIsGood;
    return (
      <span>
        <span
          className={cn(
            'font-semibold',
            good === true && (onDark ? 'text-emerald-300' : 'text-emerald-600'),
            good === false && (onDark ? 'text-red-300' : 'text-red-600'),
          )}
        >
          {change > 0 ? '+' : ''}
          {pct(change)}
        </span>{' '}
        {t('vsPrevious')}
      </span>
    );
  };

  const download = (format: 'xlsx' | 'pdf') =>
    void exporting.run(() => apiDownload(`/finance/pnl/export?to=${range.to}&format=${format}`, `compte-resultat.${format}`));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={tc('nav.finance')}
        subtitle={valid ? `${formatDate(range.from, locale)} – ${formatDate(range.to, locale)}` : undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => download('pdf')} disabled={!valid || exporting.pending}>
              <FileText aria-hidden />
              {t('pnlPdf')}
            </Button>
            <Button onClick={() => download('xlsx')} disabled={!valid || exporting.pending}>
              <FileSpreadsheet aria-hidden />
              {t('pnlExcel')}
            </Button>
          </>
        }
      />
      <FormError message={exporting.error} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
          {(['today', 'month', 'lastMonth', 'last30', 'custom'] as const).map((p) => (
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
              {t(`preset.${p}`)}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex gap-2">
            <Input type="date" aria-label={tc('register.from')} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="w-44" />
            <Input type="date" aria-label={tc('register.to')} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="w-44" />
          </div>
        )}
      </div>

      {query.error && <FormError message={tc('errors.generic')} />}

      {d && (
        <>
          <div className={cn('grid grid-cols-2 gap-4 lg:grid-cols-4', query.loading && 'opacity-60')}>
            <StatCard highlight icon={TrendingUp} label={t('revenue')} value={m(d.current.revenue)} footnote={delta('revenue', true, true)} />
            <StatCard icon={Receipt} label={t('expenses')} value={m(d.current.expenses)} footnote={delta('expenses', false)} />
            <StatCard icon={PiggyBank} label={t('profit')} value={m(d.current.profit)} footnote={delta('profit')} />
            <StatCard icon={Percent} label={t('margin')} value={pct(d.current.margin)} footnote={delta('margin')} />
            <StatCard
              icon={BedDouble}
              label={t('occupancy')}
              value={pct(d.current.occupancy)}
              footnote={t('nights', { occupied: d.current.occupiedNights, available: d.current.availableNights })}
            />
            <StatCard icon={CircleDollarSign} label={t('adr')} value={m(d.current.adr)} footnote={delta('adr')} />
            <StatCard icon={Moon} label={t('revpar')} value={m(d.current.revpar)} footnote={delta('revpar')} />
            <StatCard icon={Wallet} label={t('costPerNight')} value={m(d.current.costPerOccupiedNight)} footnote={delta('costPerOccupiedNight', false)} />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t('htNote')}</p>

          {d.alerts.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="flex flex-col gap-2">
                {d.alerts.map((a) => (
                  <p key={a.categoryId} className="flex items-start gap-2 text-sm text-amber-900">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {t('alert', {
                      category: categoryLabel(a, locale),
                      amount: m(a.amount),
                      average: m(a.average),
                      percent: pct((a.amount - a.average) / a.average),
                    })}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>{t('revenueVsExpenses')}</CardTitle>
              </CardHeader>
              <CardContent>
                <RevenueExpensesChart months={d.months} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('bySource')}</CardTitle>
              </CardHeader>
              <CardContent>
                {d.bySource.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noData')}</p>
                ) : (
                  <HorizontalBars
                    data={d.bySource.map((s) => ({ name: tc(`source.${s.source}`), value: s.net }))}
                  />
                )}
                <p className="mt-3 text-xs text-muted-foreground">{t('bySourceNote')}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>{t('expensesByCategory')}</CardTitle>
              </CardHeader>
              <CardContent>
                {d.expensesByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noData')}</p>
                ) : (
                  <DonutChart data={d.expensesByCategory.map((c) => ({ name: categoryLabel(c, locale), value: c.amount }))} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('extras')}</CardTitle>
              </CardHeader>
              <CardContent>
                {d.extrasByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noData')}</p>
                ) : (
                  <HorizontalBars data={d.extrasByCategory.map((e) => ({ name: tc(`extraCategory.${e.category}`), value: e.amount }))} />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden pb-0">
            <CardHeader>
              <CardTitle>{t('pnl')}</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-start font-medium" />
                    {d.months.map((mo) => (
                      <th key={mo.month} className="px-3 py-2.5 text-end font-medium">
                        {new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
                          new Date(`${mo.month}-01T00:00:00Z`),
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {(
                    [
                      ['accommodation', (x: PeriodMetricsDto) => m(x.accommodationRevenue)],
                      ['extrasRow', (x: PeriodMetricsDto) => m(x.extrasRevenue)],
                      ['revenue', (x: PeriodMetricsDto) => m(x.revenue), true],
                      ['expenses', (x: PeriodMetricsDto) => m(x.expenses)],
                      ['profit', (x: PeriodMetricsDto) => m(x.profit), true],
                      ['margin', (x: PeriodMetricsDto) => pct(x.margin)],
                      ['occupancy', (x: PeriodMetricsDto) => pct(x.occupancy)],
                      ['adr', (x: PeriodMetricsDto) => m(x.adr)],
                    ] as [string, (x: PeriodMetricsDto) => string, boolean?][]
                  ).map(([key, fmt, strong]) => (
                    <tr key={key} className={cn(strong && 'bg-teal-100/30 font-semibold')}>
                      <td className="px-5 py-2.5">{t(key)}</td>
                      {d.months.map((mo) => (
                        <td key={mo.month} className="px-3 py-2.5 text-end whitespace-nowrap">
                          {fmt(mo)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
