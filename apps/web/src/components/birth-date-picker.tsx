'use client';

import { todayIso, type IsoDate } from '@riad/shared';
import { CalendarDays } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate, intlLocale } from '@/lib/format';
import { cn } from '@/lib/utils';

const ITEM = 40; // px per row
const VISIBLE = 7; // rows shown, the middle one is the selection
const OLDEST = 110; // years back

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Date of birth as three scrolling wheels (year, month, day), in a sheet on phones.
 * Value is an ISO date ("" when empty); a future date is brought back to today.
 */
export function BirthDatePicker({
  id,
  value,
  onChange,
  invalid,
  title,
}: {
  id: string;
  value: string;
  onChange: (value: IsoDate | '') => void;
  invalid?: boolean;
  title: string;
}) {
  const t = useTranslations('datePicker');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const [draft, setDraft] = useState({ y: 1990, m: 1, d: 1 });

  const years = useMemo(() => Array.from({ length: OLDEST + 1 }, (_, i) => thisYear - OLDEST + i), [thisYear]);
  const months = useMemo(() => {
    const f = new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', timeZone: 'UTC' });
    return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2000, i, 1))));
  }, [locale]);
  const dayCount = daysIn(draft.y, draft.m);

  function show() {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    setDraft(m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : { y: 1990, m: 1, d: 1 });
    setOpen(true);
  }

  function confirm() {
    const d = Math.min(draft.d, dayCount);
    const iso = `${draft.y}-${pad(draft.m)}-${pad(d)}`;
    onChange(iso > today ? today : iso);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={show}
        aria-invalid={invalid || undefined}
        aria-haspopup="dialog"
        className="flex h-12 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-background px-4 text-start text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
      >
        <span className={cn('truncate', !value && 'text-muted-foreground')}>
          {value ? formatDate(value, locale, { day: 'numeric', month: 'long', year: 'numeric' }) : t('placeholder')}
        </span>
        <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle className="text-sm font-semibold tracking-wider uppercase">{title}</DialogTitle>
            <DialogDescription className="sr-only">{t('hint')}</DialogDescription>
          </DialogHeader>

          <div className="relative -mx-5 sm:-mx-6">
            {/* Selection band, in the brand colour. */}
            <div
              className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-xl bg-primary/10"
              style={{ height: ITEM }}
              aria-hidden
            />
            <div className="relative grid grid-cols-[1.1fr_1fr_0.8fr]">
              <Wheel label={t('year')} items={years.map(String)} index={years.indexOf(draft.y)} onIndex={(i) => setDraft((v) => ({ ...v, y: years[i]! }))} />
              <Wheel label={t('month')} items={months} index={draft.m - 1} onIndex={(i) => setDraft((v) => ({ ...v, m: i + 1 }))} />
              <Wheel
                label={t('day')}
                items={Array.from({ length: dayCount }, (_, i) => String(i + 1))}
                index={Math.min(draft.d, dayCount) - 1}
                onIndex={(i) => setDraft((v) => ({ ...v, d: i + 1 }))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button type="button" size="lg" className="w-full" onClick={confirm}>
              {t('confirm')}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                {t('clear')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One scroll-snapping column; the row in the middle is the chosen one. */
function Wheel({ label, items, index, onIndex }: { label: string; items: string[]; index: number; onIndex: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId();
  const [live, setLive] = useState(index);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const safe = Math.max(0, Math.min(index, items.length - 1));

  // Opening, or a value changed from outside (e.g. 31 → 30 days): put that row in the middle.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ITEM) !== safe) el.scrollTop = safe * ITEM;
    setLive(safe);
  }, [safe, items.length]);

  useEffect(() => () => clearTimeout(settle.current), []);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
    setLive(i);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => i !== index && onIndex(i), 120);
  }

  function go(i: number) {
    const next = Math.max(0, Math.min(items.length - 1, i));
    ref.current?.scrollTo({ top: next * ITEM, behavior: 'smooth' });
  }

  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${uid}-${live}`}
      onScroll={onScroll}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        go(e.key === 'ArrowDown' ? live + 1 : live - 1);
      }}
      className="snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-xl outline-none [scrollbar-width:none] focus-visible:ring-[3px] focus-visible:ring-ring/40 [&::-webkit-scrollbar]:hidden"
      style={{
        height: ITEM * VISIBLE,
        paddingBlock: ITEM * Math.floor(VISIBLE / 2),
        maskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
      }}
    >
      {items.map((item, i) => {
        const dist = Math.abs(i - live);
        return (
          <div
            key={i}
            id={`${uid}-${i}`}
            role="option"
            aria-selected={i === live}
            onClick={() => go(i)}
            className={cn(
              'flex snap-center items-center justify-center tabular-nums transition-[color,font-size] select-none',
              dist === 0 ? 'text-xl font-semibold text-primary' : dist === 1 ? 'text-base text-foreground/70' : 'text-sm text-muted-foreground/60',
            )}
            style={{ height: ITEM }}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}
