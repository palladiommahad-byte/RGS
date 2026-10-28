import { cn } from '@/lib/utils';

/** KPI card: label top, big value, small footnote; `highlight` = filled brand card. */
export function StatCard({
  label,
  value,
  footnote,
  icon: Icon,
  highlight,
  className,
}: {
  label: string;
  value: React.ReactNode;
  footnote?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-32 flex-col gap-2 rounded-xl border p-5',
        highlight ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn('text-sm font-medium', highlight ? 'text-white/85' : 'text-foreground')}>
          {label}
        </span>
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            highlight ? 'bg-white/15 text-white' : 'border text-teal-900',
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div className="text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {footnote && (
        <div className={cn('mt-auto text-xs', highlight ? 'text-white/75' : 'text-muted-foreground')}>
          {footnote}
        </div>
      )}
    </div>
  );
}
