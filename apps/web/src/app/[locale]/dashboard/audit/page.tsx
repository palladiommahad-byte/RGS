'use client';

import {
  AUDIT_AREA_KEYS,
  auditArea,
  auditKind,
  localDate,
  type AuditArea,
  type AuditKind,
  type AuditLogDto,
  type Paginated,
} from '@riad/shared';
import { ChevronDown, Eye, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Link } from '@/i18n/navigation';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const LIMIT = 30;
type Filter = AuditArea | 'ALL';

const KIND_STYLE: Record<AuditKind, { icon: typeof Plus; className: string }> = {
  create: { icon: Plus, className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  update: { icon: Pencil, className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  delete: { icon: Trash2, className: 'bg-red-50 text-red-700 ring-red-200' },
  access: { icon: Eye, className: 'bg-amber-50 text-amber-800 ring-amber-200' },
};

const MONEY_FIELD = /amount|price|total|salary|net|gross/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One recorded value, readable: money in MAD, ids shortened, lists joined. */
function formatValue(key: string, value: unknown, locale: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && MONEY_FIELD.test(key)) return formatMoney(value, locale);
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (typeof value === 'string') return UUID.test(value) ? `#${value.slice(0, 8)}` : value;
  if (Array.isArray(value)) return value.map((v) => formatValue(key, v, locale)).join(', ');
  return JSON.stringify(value);
}

/** Where the change can be seen, when there is a page for it. */
function targetHref(entry: AuditLogDto): string | null {
  if (entry.entity === 'Stay' && entry.entityId) return `/dashboard/stays/${entry.entityId}`;
  const stayId = entry.diff?.stayId;
  return typeof stayId === 'string' ? `/dashboard/stays/${stayId}` : null;
}

export default function AuditPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { can } = useAuth();
  const allowed = can('audit.read');
  const [area, setArea] = useState<Filter>('ALL');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (area !== 'ALL') params.set('area', area);
  if (userId) params.set('userId', userId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = useApiQuery<Paginated<AuditLogDto>>(allowed ? `/audit?${params}` : null);
  const users = useApiQuery<{ id: string; name: string }[]>(allowed ? '/audit/users' : null);

  if (!allowed) return <p className="text-muted-foreground">{t('dashboard.forbidden')}</p>;

  const filtered = area !== 'ALL' || userId || from || to;
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const clear = () => {
    setArea('ALL');
    setUserId('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  // Newest first, grouped by riad-local day.
  const days: { day: string; entries: AuditLogDto[] }[] = [];
  for (const e of query.data?.items ?? []) {
    const day = localDate(new Date(e.createdAt));
    if (days.at(-1)?.day !== day) days.push({ day, entries: [] });
    days.at(-1)!.entries.push(e);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('nav.audit')} subtitle={t('audit.subtitle')} />

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
          {(['ALL', ...AUDIT_AREA_KEYS] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={area === f}
              onClick={() => change(setArea)(f)}
              className={cn(
                'h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                area === f ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {f === 'ALL' ? t('audit.all') : t(`audit.areas.${f}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
            <span className="text-muted-foreground">{t('audit.person')}</span>
            <Select value={userId} onChange={(e) => change(setUserId)(e.target.value)} className="h-11">
              <option value="">{t('audit.everyone')}</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('audit.from')}</span>
            <Input type="date" value={from} max={to || undefined} onChange={(e) => change(setFrom)(e.target.value)} className="h-11" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('audit.to')}</span>
            <Input type="date" value={to} min={from || undefined} onChange={(e) => change(setTo)(e.target.value)} className="h-11" />
          </label>
          <Button variant="ghost" onClick={clear} disabled={!filtered} className="col-span-2 h-11 sm:col-span-1">
            <X aria-hidden />
            {t('audit.clear')}
          </Button>
        </div>
      </div>

      {query.data && <p className="text-sm text-muted-foreground">{t('common.results', { count: query.data.total })}</p>}

      {query.data?.items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">{t('audit.empty')}</p>
      ) : (
        <div className={cn('flex flex-col gap-5', query.loading && 'opacity-60')}>
          {days.map(({ day, entries }) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground first-letter:uppercase">
                {formatDate(day, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h2>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {entries.map((e) => (
                  <AuditRow key={e.id} entry={e} />
                ))}
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

      {query.data && <Pagination page={page} limit={LIMIT} total={query.data.total} onPage={setPage} />}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditLogDto }) {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const kind = KIND_STYLE[auditKind(entry.action)];
  const area = auditArea(entry.action);
  const label = t.has(`auditAction.${entry.action}`) ? t(`auditAction.${entry.action}`) : entry.action;
  const fields = Object.entries(entry.diff ?? {});
  const href = targetHref(entry);

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ring-1', kind.className)} aria-hidden>
          <kind.icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{label}</span>
            {area && <span className="text-xs text-muted-foreground">{t(`audit.areas.${area}`)}</span>}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {entry.user?.name ?? t('audit.system')}
            {entry.entityId && <span className="ms-2 font-mono text-xs">#{entry.entityId.slice(0, 8)}</span>}
          </div>
          {open && fields.length > 0 && (
            <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-xl bg-muted/60 p-3 text-xs sm:grid-cols-[max-content_minmax(0,1fr)]">
              {fields.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-words">
                    {Array.isArray(v) && v.length === 2 ? (
                      <>
                        <span className="text-muted-foreground line-through">{formatValue(k, v[0], locale)}</span>
                        <span className="mx-1.5 text-muted-foreground">→</span>
                        <span className="font-medium">{formatValue(k, v[1], locale)}</span>
                      </>
                    ) : (
                      <span className="font-medium">{formatValue(k, v, locale)}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <time dateTime={entry.createdAt} className="text-sm tabular-nums text-muted-foreground">
            {formatTime(entry.createdAt, locale)}
          </time>
          <div className="flex items-center gap-1">
            {href && (
              <Link href={href} className="inline-flex min-h-9 items-center rounded-md px-3 text-xs font-medium text-primary hover:bg-accent sm:min-h-0 sm:px-2 sm:py-1">
                {t('audit.open')}
              </Link>
            )}
            {fields.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="inline-flex min-h-9 items-center gap-1 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-accent sm:min-h-0 sm:px-2 sm:py-1"
              >
                {t('audit.details')}
                <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
