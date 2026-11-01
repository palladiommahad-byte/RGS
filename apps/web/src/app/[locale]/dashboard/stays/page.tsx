'use client';

import { STAY_STATUSES, todayIso, type Paginated, type StaySummaryDto, type StayStatus } from '@riad/shared';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { StayList } from '@/components/stays/stay-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/lib/use-api';

const LIMIT = 20;
type Filter = StayStatus | 'ALL';

export default function StaysPage() {
  const t = useTranslations();
  const { can } = useAuth();
  const [status, setStatus] = useState<Filter>('ALL');
  // ?q= comes from the top-bar search (also when searching again from this page).
  const q = useSearchParams().get('q') ?? '';
  const [search, setSearch] = useState(q);
  const [debounced, setDebounced] = useState(q.trim());
  useEffect(() => setSearch(q), [q]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (status !== 'ALL') params.set('status', status);
  if (debounced) params.set('search', debounced);
  const query = useApiQuery<Paginated<StaySummaryDto>>(`/stays?${params.toString()}`);

  // How many stays per status, shown on the filters (one tiny request each).
  const counts = useStatusCounts(debounced);
  const reloadAll = () => {
    query.reload();
    counts.reload();
  };
  useRealtimeEvent('checkin:new', reloadAll);
  useRealtimeEvent('stays:changed', reloadAll);

  const filters: Filter[] = ['ALL', ...STAY_STATUSES];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('nav.stays')}
        actions={
          can('stays.write') && (
            <Button asChild>
              <Link href="/dashboard/stays/new">
                <Plus aria-hidden />
                {t('stays.new')}
              </Link>
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('stays.searchPlaceholder')}
            aria-label={t('common.search')}
            className="h-12 rounded-xl ps-12"
          />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={status === f}
              onClick={() => {
                setStatus(f);
                setPage(1);
              }}
              className={cn(
                'h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                status === f ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {f === 'ALL' ? t('stays.all') : t(`stayStatus.${f}`)}
              {counts.values[f] !== undefined && (
                <span className={cn('ms-2 rounded-full px-1.5 text-xs tabular-nums', status === f ? 'bg-white/20' : 'bg-muted')}>{counts.values[f]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {query.data && (
        <p className="text-sm text-muted-foreground">{t('common.results', { count: query.data.total })}</p>
      )}

      {query.data?.items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">{t('stays.empty')}</p>
      ) : (
        <div className={cn(query.loading && 'opacity-60')}>
          {query.data && <StayList stays={query.data.items} today={todayIso()} />}
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

/** Number of stays per status (matching the search), for the filter chips. */
function useStatusCounts(search: string) {
  const q = (status?: StayStatus) => {
    const p = new URLSearchParams({ limit: '1' });
    if (status) p.set('status', status);
    if (search) p.set('search', search);
    return `/stays?${p.toString()}`;
  };
  const all = useApiQuery<Paginated<StaySummaryDto>>(q());
  const pending = useApiQuery<Paginated<StaySummaryDto>>(q('PENDING'));
  const inHouse = useApiQuery<Paginated<StaySummaryDto>>(q('CHECKED_IN'));
  const left = useApiQuery<Paginated<StaySummaryDto>>(q('CHECKED_OUT'));
  const cancelled = useApiQuery<Paginated<StaySummaryDto>>(q('CANCELLED'));
  return {
    values: {
      ALL: all.data?.total,
      PENDING: pending.data?.total,
      CHECKED_IN: inHouse.data?.total,
      CHECKED_OUT: left.data?.total,
      CANCELLED: cancelled.data?.total,
    } as Record<Filter, number | undefined>,
    reload: () => [all, pending, inHouse, left, cancelled].forEach((x) => x.reload()),
  };
}
