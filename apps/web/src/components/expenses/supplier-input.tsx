'use client';

import type { Paginated, SupplierDto } from '@riad/shared';
import { Store } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

/**
 * Free text with suggestions from existing suppliers (accent-insensitive). Picking one
 * reports it so the form can pre-select its default category; a new name is created
 * by the API when the expense is saved.
 */
export function SupplierInput({
  id,
  value,
  onChange,
  onPick,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (name: string) => void;
  onPick: (supplier: SupplierDto) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<SupplierDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const picked = useRef<string | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || q === picked.current) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api<Paginated<SupplierDto>>(`/suppliers?search=${encodeURIComponent(q)}&limit=6`)
        .then((r) => {
          if (cancelled) return;
          setSuggestions(r.items);
          setOpen(r.items.length > 0);
          setActive(-1);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  function pick(s: SupplierDto) {
    picked.current = s.name;
    onChange(s.name);
    onPick(s);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onChange={(e) => {
          picked.current = null;
          onChange(e.target.value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => setOpen(suggestions.length > 0)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            pick(suggestions[active]!);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`flex min-h-11 w-full items-center gap-2 px-3 text-start text-sm hover:bg-accent ${i === active ? 'bg-accent' : ''}`}
              >
                <Store className="size-4 text-muted-foreground" aria-hidden />
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
