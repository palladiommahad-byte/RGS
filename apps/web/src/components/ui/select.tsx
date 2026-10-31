'use client';

import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { cn } from '@/lib/utils';

type Option = { value: string; label: React.ReactNode; text: string; disabled: boolean };

/** Plain text of a node, for search and type-ahead. */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** The <option> elements among the children (fragments and lists included). */
function readOptions(children: React.ReactNode): Option[] {
  const out: Option[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>(child)) return;
    if (child.type === React.Fragment) {
      out.push(...readOptions(child.props.children));
    } else if (child.type === 'option') {
      const label = child.props.children;
      const text = textOf(label);
      out.push({ value: String(child.props.value ?? text), label, text, disabled: !!child.props.disabled });
    }
  });
  return out;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
/** Lists longer than this get a search box. */
const SEARCH_FROM = 10;

type SelectProps = Omit<React.ComponentProps<'button'>, 'value' | 'onChange' | 'children'> & {
  value: string;
  /** Same shape as a native select's change event: read `e.target.value`. */
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  required?: boolean;
};

/**
 * Drop-in replacement for a native <select> (same <option> children and onChange), drawn as
 * a styled list: keyboard navigation, type-ahead, a search box on long lists, RTL aware.
 */
function Select({ value, onChange, children, className, disabled, required, id, ...props }: SelectProps) {
  const t = useTranslations('common');
  const options = React.useMemo(() => readOptions(children), [children]);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const typed = React.useRef({ text: '', at: 0 });
  const listId = React.useId();

  const selected = options.find((o) => o.value === value);
  const searchable = options.length > SEARCH_FROM;
  // Search: names starting with the text first ("moro" → Morocco before Comoros).
  const shown = React.useMemo(() => {
    if (!query) return options;
    const q = fold(query);
    const hits = options.filter((o) => fold(o.text).includes(q));
    return [...hits.filter((o) => fold(o.text).startsWith(q)), ...hits.filter((o) => !fold(o.text).startsWith(q))];
  }, [options, query]);

  const choose = (o: Option) => {
    if (o.disabled) return;
    setOpen(false);
    if (o.value !== value) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } } as React.ChangeEvent<HTMLSelectElement>);
  };

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery('');
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    }
  };

  // Keep the highlighted option in view.
  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, active, shown]);

  const move = (from: number, step: number) => {
    for (let i = 1; i <= shown.length; i++) {
      const next = (from + step * i + shown.length * i) % shown.length;
      if (!shown[next]?.disabled) return next;
    }
    return from;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive((a) => move(a, 1));
    else if (e.key === 'ArrowUp') setActive((a) => move(a, -1));
    else if (e.key === 'Home') setActive(move(-1, 1));
    else if (e.key === 'End') setActive(move(shown.length, -1));
    else if (e.key === 'Enter' || (e.key === ' ' && !searchable)) {
      const o = shown[active];
      if (o) choose(o);
    } else if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Type-ahead: jump to the first option starting with what was typed.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + fold(e.key), at: now };
      const i = shown.findIndex((o) => !o.disabled && fold(o.text).startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    } else return;
    e.preventDefault();
  };

  return (
    <Popover.Root open={open} onOpenChange={openChange}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-haspopup="listbox"
          aria-required={required || undefined}
          className={cn(
            'flex h-12 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-background ps-4 pe-3 text-start text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/30',
            className,
          )}
          {...props}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected?.label ?? '—'}</span>
          <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(e) => {
            // Phones: no keyboard popping up just to pick from a list.
            e.preventDefault();
            const fine = window.matchMedia('(pointer: fine)').matches;
            (searchable && fine ? searchRef.current : listRef.current)?.focus();
          }}
          className="z-50 flex max-h-[min(22rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-48 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {searchable && (
            <div className="relative border-b p-2">
              <Search className="pointer-events-none absolute start-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder={t('search')}
                aria-label={t('search')}
                aria-controls={listId}
                className="h-10 w-full rounded-lg bg-muted/60 ps-9 pe-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            className="flex-1 overflow-y-auto overscroll-contain p-1.5 outline-none"
          >
            {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t('noResults')}</li>}
            {shown.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <li
                  key={`${o.value}-${i}`}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={o.disabled || undefined}
                  onPointerMove={() => !o.disabled && setActive(i)}
                  onClick={() => choose(o)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[15px] select-none',
                    i === active && 'bg-accent',
                    isSelected && 'font-medium text-primary',
                    o.disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {isSelected && <Check className="size-4 shrink-0" aria-hidden />}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export { Select };
