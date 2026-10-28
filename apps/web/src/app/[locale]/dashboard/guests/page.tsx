'use client';

import { addDays, todayIso, type GuestRegisterRowDto, type Paginated } from '@riad/shared';
import { FileSpreadsheet, FileText, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FormError, FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StayStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { apiDownload } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAction, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const LIMIT = 25;

function monthRange(): { from: string; to: string } {
  const today = todayIso();
  const from = `${today.slice(0, 8)}01`;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: next.toISOString().slice(0, 10) };
}

/** Guest register (police fiche): everyone who stayed, searchable and exportable. */
export default function GuestRegisterPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [{ from, to }, setRange] = useState(monthRange);
  const [page, setPage] = useState(1);
  const exporting = useAction();

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (debounced) params.set('search', debounced);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = useApiQuery<Paginated<GuestRegisterRowDto>>(`/guests?${params.toString()}`);

  const canExport = Boolean(from && to && to > from);
  const short: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };

  const download = (format: 'csv' | 'xlsx') =>
    void exporting.run(() =>
      apiDownload(`/guests/export?from=${from}&to=${to}&format=${format}`, `registre-clients.${format}`),
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('nav.guests')}
        subtitle={t('register.subtitle')}
        actions={
          <>
            <Button variant="outline" disabled={!canExport || exporting.pending} onClick={() => download('csv')}>
              <FileText aria-hidden />
              {t('register.exportCsv')}
            </Button>
            <Button disabled={!canExport || exporting.pending} onClick={() => download('xlsx')}>
              <FileSpreadsheet aria-hidden />
              {t('register.exportXlsx')}
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
          <FormField id="reg-search" label={t('common.search')}>
            <div className="relative">
              <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="reg-search"
                type="search"
                className="ps-12"
                placeholder={t('register.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </FormField>
          <FormField id="reg-from" label={t('register.from')}>
            <Input id="reg-from" type="date" value={from} onChange={(e) => (setRange((r) => ({ ...r, from: e.target.value })), setPage(1))} />
          </FormField>
          <FormField id="reg-to" label={t('register.to')}>
            <Input id="reg-to" type="date" value={to} min={from ? addDays(from, 1) : undefined} onChange={(e) => (setRange((r) => ({ ...r, to: e.target.value })), setPage(1))} />
          </FormField>
        </CardContent>
      </Card>

      {!canExport && <p className="text-sm text-muted-foreground">{t('register.exportHint')}</p>}
      <FormError message={exporting.error} />

      <Card className="overflow-hidden py-0">
        <div className="overflow-x-auto">
          <table className={cn('w-full min-w-[760px] text-sm', query.loading && 'opacity-60')}>
            <thead className="bg-muted/60 text-start text-xs font-medium text-muted-foreground">
              <tr>
                {['name', 'nationality', 'document', 'birth', 'stay', 'room'].map((k) => (
                  <th key={k} scope="col" className="px-4 py-3 text-start font-medium">
                    {t(`register.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {query.data?.items.map((r) => (
                <tr key={r.guestId} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/stays/${r.stayId}`} className="font-medium hover:underline">
                      {r.lastName.toUpperCase()} {r.firstName}
                    </Link>
                    {r.isMain && <Badge tone="teal" className="ms-2">{t('stays.main')}</Badge>}
                  </td>
                  <td className="px-4 py-3" dir="ltr">{r.nationality ?? '—'}</td>
                  <td className="px-4 py-3">
                    {r.documentType && <span className="text-muted-foreground">{t(`documentType.${r.documentType}`)} </span>}
                    <span className="font-mono" dir="ltr">{r.documentNumber ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.birthDate ? formatDate(r.birthDate, locale, short) : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>
                      {formatDate(r.checkInDate, locale, short)} → {formatDate(r.checkOutDate, locale, short)}
                    </div>
                    <StayStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">{r.room ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {query.data?.items.length === 0 && (
          <p className="p-6 text-center text-muted-foreground">{t('register.empty')}</p>
        )}
      </Card>

      {query.data && <Pagination page={page} limit={LIMIT} total={query.data.total} onPage={setPage} />}
    </div>
  );
}
