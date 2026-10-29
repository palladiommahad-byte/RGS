'use client';

import type { FinanceDashboardDto } from '@riad/shared';
import { useLocale, useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney, intlLocale } from '@/lib/format';

/** Teal ramp first (brand), then warm accents so categories stay distinguishable. */
export const CHART_COLORS = [
  '#134e48',
  '#5c948b',
  '#9fc4bd',
  '#c9a227',
  '#d97757',
  '#7c6f9b',
  '#2e6b63',
  '#b5838d',
  '#a3a3a3',
  '#6d9dc5',
];

function useMoney() {
  const locale = useLocale();
  const compact = new Intl.NumberFormat(intlLocale(locale), {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  return {
    axis: (centimes: number) => compact.format(centimes / 100),
    full: (centimes: number) => formatMoney(centimes, locale),
  };
}

const tooltipStyle = { borderRadius: 10, border: '1px solid var(--border)', fontSize: 12 };

export function RevenueExpensesChart({ months }: { months: FinanceDashboardDto['months'] }) {
  const t = useTranslations('finance');
  const locale = useLocale();
  const money = useMoney();
  const label = (m: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', timeZone: 'UTC' }).format(
      new Date(`${m}-01T00:00:00Z`),
    );
  const data = months.map((m) => ({
    month: label(m.month),
    revenue: m.revenue,
    expenses: m.expenses,
  }));
  return (
    <div dir="ltr" className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis
            tickFormatter={money.axis}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={48}
          />
          <Tooltip
            formatter={(v) => money.full(Number(v))}
            contentStyle={tooltipStyle}
            cursor={{ fill: 'var(--accent)' }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="revenue" name={t('revenue')} fill="#134e48" radius={[6, 6, 0, 0]} />
          <Bar dataKey="expenses" name={t('expenses')} fill="#9fc4bd" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  const money = useMoney();
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-4 @lg:flex-row">
        <div dir="ltr" className="h-52 w-52 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="62%"
                outerRadius="100%"
                paddingAngle={2}
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => money.full(Number(v))} contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex w-full flex-col gap-1.5 text-sm">
          {data.map((d, i) => (
            <li key={d.name} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {total ? Math.round((d.value / total) * 100) : 0} %
              </span>
              <span className="shrink-0 text-end font-medium whitespace-nowrap tabular-nums">
                {money.full(d.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Horizontal bars, one per item (sources, extras categories). */
export function HorizontalBars({
  data,
}: {
  data: { name: string; value: number; secondary?: number }[];
}) {
  const money = useMoney();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="flex flex-col gap-3">
      {data.map((d, i) => (
        <li key={d.name} className="flex flex-col gap-1">
          <div className="flex justify-between gap-3 text-sm">
            <span>{d.name}</span>
            <span className="font-medium tabular-nums">{money.full(d.value)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: CHART_COLORS[i % CHART_COLORS.length],
              }}
            />
          </div>
          {d.secondary !== undefined && d.secondary > 0 && (
            <span className="text-xs text-muted-foreground">{money.full(d.secondary)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
