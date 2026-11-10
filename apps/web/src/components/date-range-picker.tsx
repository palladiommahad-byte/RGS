'use client';

import * as Popover from '@radix-ui/react-popover';
import { addDays, nightsBetween, todayIso, type IsoDate } from '@riad/shared';
import { CalendarRange, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate, intlLocale } from '@/lib/format';
import { cn } from '@/lib/utils';

export type DateRange = { from: string; to: string };

const monthOf = (iso: string) => `${iso.slice(0, 7)}-01` as IsoDate;
function shiftMonth(first: IsoDate, by: number): IsoDate {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10) as IsoDate;
}

/** Phones get a bottom sheet, computers a dropdown under the field. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}

/**
 * One field for a period: tap it, pick the first day then the last day on a calendar
 * (inclusive), then Apply. Both ends may be empty when `clearable`.
 */
export function DateRangePicker({
  id,
  value,
  onChange,
  label,
  min,
  max,
  clearable,
  className,
}: {
  id?: string;
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Accessible name and sheet title. */
  label: string;
  min?: string;
  max?: string;
  clearable?: boolean;
  className?: string;
}) {
  const t = useTranslations('datePicker');
  const locale = useLocale();
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const [month, setMonth] = useState<IsoDate>(monthOf(value.from || todayIso()));

  function openChange(next: boolean) {
    if (next) {
      setDraft(value);
      setMonth(monthOf(value.from || value.to || todayIso()));
    }
    setOpen(next);
  }

  function apply() {
    if (!draft.from) return;
    onChange({ from: draft.from, to: draft.to || draft.from });
    setOpen(false);
  }

  const fmt = (iso: string) => formatDate(iso as IsoDate, locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const text = value.from || value.to ? `${value.from ? fmt(value.from) : '…'} – ${value.to ? fmt(value.to) : '…'}` : t('anyDate');

  const trigger = (
    <button
      type="button"
      id={id}
      aria-label={`${label}: ${text}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={wide ? undefined : () => openChange(true)}
      className={cn(
        'flex h-11 w-full min-w-0 items-center gap-2.5 rounded-lg border border-input bg-background ps-3.5 pe-3 text-start text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        open && 'border-ring ring-[3px] ring-ring/30',
        className,
      )}
    >
      <CalendarRange className="size-[18px] shrink-0 text-primary" aria-hidden />
      <span className={cn('min-w-0 flex-1 truncate font-medium tabular-nums', !value.from && !value.to && 'font-normal text-muted-foreground')}>{text}</span>
    </button>
  );

  const body = (
    <RangePanel
      draft={draft}
      setDraft={setDraft}
      month={month}
      setMonth={setMonth}
      min={min}
      max={max}
      onApply={apply}
      onClear={
        clearable && (value.from || value.to)
          ? () => {
              onChange({ from: '', to: '' });
              setOpen(false);
            }
          : undefined
      }
    />
  );

  if (!wide) {
    return (
      <>
        {trigger}
        <Dialog open={open} onOpenChange={openChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription>{t('rangeHint')}</DialogDescription>
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={openChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          className="z-50 w-[22rem] rounded-2xl border bg-card p-4 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          {body}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function RangePanel({
  draft,
  setDraft,
  month,
  setMonth,
  min,
  max,
  onApply,
  onClear,
}: {
  draft: DateRange;
  setDraft: (r: DateRange) => void;
  month: IsoDate;
  setMonth: (m: IsoDate) => void;
  min?: string;
  max?: string;
  onApply: () => void;
  onClear?: () => void;
}) {
  const t = useTranslations('datePicker');
  const locale = useLocale();
  const today = todayIso();
  const [hover, setHover] = useState<string | null>(null);

  const title = new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}T00:00:00Z`),
  );
  // Monday first, as in Morocco and France.
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'narrow', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))));
  }, [locale]);
  const days = useMemo(() => {
    const lead = (new Date(`${month}T00:00:00Z`).getUTCDay() + 6) % 7;
    const start = addDays(month, -lead);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);

  // While choosing the end, the range follows the pointer.
  const end = draft.to || (draft.from && hover && hover >= draft.from ? hover : '');
  const lo = draft.from;
  const hi = end || draft.from;

  function pick(day: string) {
    if (!draft.from || draft.to) setDraft({ from: day, to: '' });
    else if (day < draft.from) setDraft({ from: day, to: draft.from });
    else setDraft({ from: draft.from, to: day });
  }

  const count = draft.from ? nightsBetween(draft.from as IsoDate, (draft.to || draft.from) as IsoDate) + 1 : 0;
  const fmt = (iso: string) => formatDate(iso as IsoDate, locale, { day: 'numeric', month: 'short' });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('prevMonth')}>
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <span className="font-semibold capitalize">{title}</span>
        <Button type="button" variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('nextMonth')}>
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground" aria-hidden>
        {weekdays.map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1" role="grid" onMouseLeave={() => setHover(null)}>
        {days.map((day) => {
          const outside = day.slice(0, 7) !== month.slice(0, 7);
          const disabled = (min && day < min) || (max && day > max);
          const isStart = day === lo;
          const isEnd = !!hi && day === hi;
          const inside = !!lo && !!hi && day > lo && day < hi;
          return (
            <div
              key={day}
              className={cn(
                'flex h-10 items-center justify-center',
                (inside || (isStart && hi > lo) || (isEnd && hi > lo)) && 'bg-primary/10',
                isStart && hi > lo && 'rounded-s-full',
                isEnd && hi > lo && 'rounded-e-full',
              )}
            >
              <button
                type="button"
                disabled={!!disabled}
                onClick={() => pick(day)}
                onMouseEnter={() => setHover(day)}
                aria-pressed={isStart || isEnd}
                aria-label={formatDate(day, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                className={cn(
                  'flex size-10 items-center justify-center rounded-full text-sm tabular-nums transition-colors',
                  outside && 'text-muted-foreground/50',
                  !isStart && !isEnd && 'hover:bg-primary/15',
                  day === today && !isStart && !isEnd && 'font-semibold text-primary ring-1 ring-primary/40',
                  (isStart || isEnd) && 'bg-primary font-semibold text-primary-foreground shadow-sm',
                  disabled && 'pointer-events-none opacity-30',
                )}
              >
                {Number(day.slice(8))}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <span className="min-w-0 text-sm text-muted-foreground">
          {draft.from ? (
            <>
              <span className="font-medium text-foreground tabular-nums">
                {fmt(draft.from)}
                {draft.to && draft.to !== draft.from && ` – ${fmt(draft.to)}`}
              </span>
              {' · '}
              {t('daysCount', { count })}
            </>
          ) : (
            t('pickStart')
          )}
        </span>
        <div className="flex shrink-0 gap-2">
          {onClear && (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              <X aria-hidden />
              {t('clear')}
            </Button>
          )}
          <Button type="button" size="sm" onClick={onApply} disabled={!draft.from}>
            {t('apply')}
          </Button>
        </div>
      </div>
    </div>
  );
}
