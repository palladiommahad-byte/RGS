import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Soft icon tiles (teal first: the brand), for telling KPIs apart at a glance. */
const TONES = {
  teal: 'bg-teal-100 text-teal-900',
  sky: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
} as const;
export type StatTone = keyof typeof TONES;

/** KPI card: label and icon tile on top, big value, then a trend chip or a footnote. */
export function StatCard({
  label,
  value,
  footnote,
  icon: Icon,
  tone = 'teal',
  highlight,
  className,
}: {
  label: string;
  value: React.ReactNode;
  footnote?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  /** Kept for existing calls: the main figure of a page, in the brand tone. */
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-32 min-w-0 flex-col gap-3 rounded-2xl border bg-card p-5 shadow-xs', className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', TONES[highlight ? 'teal' : tone])} aria-hidden>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div className="text-[28px] leading-none font-semibold tracking-tight tabular-nums">{value}</div>
      {footnote && <div className="mt-auto text-xs text-muted-foreground">{footnote}</div>}
    </div>
  );
}

/** "▲ +8.2 % vs last month": green when the change is good, red when it is bad. */
export function TrendChip({ change, good, label, format }: { change: number; good: boolean | null; label: string; format: (n: number) => string }) {
  const Arrow = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
          good === true && 'bg-emerald-50 text-emerald-700',
          good === false && 'bg-red-50 text-red-700',
          good === null && 'bg-muted text-muted-foreground',
        )}
      >
        <Arrow className="size-3 rtl:-scale-x-100" aria-hidden />
        {change > 0 ? '+' : ''}
        {format(change)}
      </span>
      <span>{label}</span>
    </span>
  );
}
