'use client';

import { STAY_STATUSES, type Paginated, type StaySummaryDto, type StayStatus } from '@riad/shared';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { StayRow } from '@/components/stays/stay-row';
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
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
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

  useRealtimeEvent('checkin:new', query.reload);

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

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('stays.searchPlaceholder')}
            aria-label={t('common.search')}
            className="ps-12"
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
        <ul className={cn('flex flex-col gap-2', query.loading && 'opacity-60')}>
          {query.data?.items.map((s) => <StayRow key={s.id} stay={s} />)}
        </ul>
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
