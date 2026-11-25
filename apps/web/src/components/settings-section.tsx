import { cn } from '@/lib/utils';

const TILES = {
  teal: 'bg-teal-100 text-teal-900',
  sky: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
} as const;

/** Settings block: icon, title and what it is for on the left (computers), content on the right. */
export function SettingsSection({
  icon: Icon,
  title,
  hint,
  tone = 'teal',
  actions,
  className,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  tone?: keyof typeof TILES;
  /** Buttons under the title (e.g. "Back up now"). */
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm md:p-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', TILES[tone])} aria-hidden>
            <Icon className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className={cn('min-w-0', className)}>{children}</div>
    </section>
  );
}
