'use client';

import { addDays, todayIso, type GuestRegisterRowDto, type Paginated } from '@riad/shared';
import { Eye, FileSpreadsheet, FileText, Search, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { DateRangePicker } from '@/components/date-range-picker';
import { useConfirm } from '@/components/feedback';
import { FormError, FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StayStatusBadge } from '@/components/status-badges';
import { SwipeActions } from '@/components/swipe-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { api, apiDownload } from '@/lib/api';
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
  const removing = useAction();
  const confirm = useConfirm();
  const { user } = useAuth();
  // Owner and manager: view or delete a stay right from the register.
  const manages = user.role.key === 'OWNER' || user.role.key === 'MANAGER';

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

  async function removeStay(r: GuestRegisterRowDto) {
    const ok = await confirm({
      title: t('register.deleteTitle'),
      message: t('register.deleteText', { name: `${r.lastName.toUpperCase()} ${r.firstName}` }),
      confirmLabel: t('register.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    if (await removing.run(() => api(`/stays/${r.stayId}`, { method: 'DELETE' }), { success: 'deleted' })) query.reload();
  }

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
        <CardContent className="grid gap-4 md:grid-cols-[3fr_2fr]">
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
          <FormField id="reg-period" label={t('datePicker.period')}>
            <DateRangePicker
              id="reg-period"
              label={t('datePicker.period')}
              className="h-12"
              value={{ from, to: to ? addDays(to, -1) : '' }}
              onChange={(r) => {
                setRange({ from: r.from, to: r.to ? addDays(r.to, 1) : '' });
                setPage(1);
              }}
            />
          </FormField>
        </CardContent>
      </Card>

      {!canExport && <p className="text-sm text-muted-foreground">{t('register.exportHint')}</p>}
      <FormError message={exporting.error ?? removing.error} />

      {/* Phones: one card per guest. */}
      <ul className={cn('flex flex-col gap-2 md:hidden', query.loading && 'opacity-60')}>
        {query.data?.items.map((r) => (
          <li key={r.guestId}>
            <SwipeActions
              actions={
                manages ? (
                  <>
                    <Link
                      href={`/dashboard/stays/${r.stayId}`}
                      className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-primary text-xs font-medium text-primary-foreground"
                    >
                      <Eye className="size-5" aria-hidden />
                      {t('register.view')}
                    </Link>
                    <button
                      type="button"
                      disabled={removing.pending}
                      onClick={() => void removeStay(r)}
                      className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-destructive text-xs font-medium text-white disabled:opacity-60"
                    >
                      <Trash2 className="size-5" aria-hidden />
                      {t('register.delete')}
                    </button>
                  </>
                ) : undefined
              }
            >
            <Link href={`/dashboard/stays/${r.stayId}`} className="flex flex-col gap-2 rounded-2xl border bg-card p-3.5 shadow-sm">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-medium">
                    {r.lastName.toUpperCase()} {r.firstName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {[r.room, r.nationality].filter(Boolean).join(' · ') || '—'}
                    {r.isMain && ` · ${t('stays.main')}`}
                  </span>
                </span>
                <StayStatusBadge status={r.status} />
              </span>
              <span className="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-2.5 text-xs">
                <span>
                  <span className="block text-muted-foreground">{t('register.stay')}</span>
                  <span className="font-medium whitespace-nowrap">
                    {formatDate(r.checkInDate, locale, short)} → {formatDate(r.checkOutDate, locale, short)}
                  </span>
                </span>
                <span>
                  <span className="block text-muted-foreground">{t('register.document')}</span>
                  <span className="block truncate font-mono font-medium" dir="ltr">
                    {r.documentNumber ?? '—'}
                  </span>
                </span>
                <span>
                  <span className="block text-muted-foreground">{t('register.birth')}</span>
                  <span className="font-medium">{r.birthDate ? formatDate(r.birthDate, locale, short) : '—'}</span>
                </span>
                {r.documentType && (
                  <span>
                    <span className="block text-muted-foreground">&nbsp;</span>
                    <span className="font-medium">{t(`documentType.${r.documentType}`)}</span>
                  </span>
                )}
              </span>
            </Link>
            </SwipeActions>
          </li>
        ))}
        {query.data?.items.length === 0 && (
          <li className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">{t('register.empty')}</li>
        )}
      </ul>

      <Card className="overflow-hidden py-0 max-md:hidden">
        <div className="overflow-x-auto">
          <table className={cn('w-full min-w-[760px] text-sm', query.loading && 'opacity-60')}>
            <thead className="bg-muted/40 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                {['name', 'nationality', 'document', 'birth', 'stay', 'room'].map((k) => (
                  <th key={k} scope="col" className="px-4 py-3 text-start font-medium">
                    {t(`register.${k}`)}
                  </th>
                ))}
                {manages && (
                  <th scope="col" className="w-24 px-4 py-3">
                    <span className="sr-only">{t('register.actions')}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {query.data?.items.map((r) => (
                <tr key={r.guestId} className="group hover:bg-accent/40">
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
                  {manages && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        <Button asChild size="icon" variant="outline" className="size-8">
                          <Link href={`/dashboard/stays/${r.stayId}`} aria-label={t('register.view')} title={t('register.view')}>
                            <Eye aria-hidden />
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={removing.pending}
                          aria-label={t('register.delete')}
                          title={t('register.delete')}
                          onClick={() => void removeStay(r)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </td>
                  )}
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
