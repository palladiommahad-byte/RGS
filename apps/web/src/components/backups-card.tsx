'use client';

import type { BackupRunDto, BackupStatusDto } from '@riad/shared';
import { CircleAlert, CircleCheck, CloudUpload, DatabaseBackup, Loader2, Lock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useAction, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const POLL_MS = 5_000;

function size(bytes: number | null, locale: string): string {
  if (bytes === null) return '—';
  const mb = bytes / 1_048_576;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} MB`;
}

/** Owner's view of the backups: last good one, off-site copy, history, "Back up now". */
export function BackupsCard() {
  const t = useTranslations('backups');
  const locale = useLocale();
  const query = useApiQuery<BackupStatusDto>('/backups');
  const now = useAction();
  const s = query.data;
  const { reload } = query;

  // While a backup waits or runs, refresh until it is done.
  useEffect(() => {
    if (!s?.inProgress) return;
    const id = setInterval(reload, POLL_MS);
    return () => clearInterval(id);
  }, [s?.inProgress, reload]);

  async function backUpNow() {
    if (await now.run(() => api('/backups', { method: 'POST' }))) reload();
  }

  const last = s?.lastOk;
  const tone = !s ? 'muted' : s.healthy ? (last?.offsite ? 'ok' : 'warn') : 'bad';

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="size-5 text-muted-foreground" aria-hidden />
          {t('title')}
        </CardTitle>
        <Button type="button" variant="outline" onClick={() => void backUpNow()} disabled={!s || s.inProgress || now.pending}>
          {s?.inProgress ? <Loader2 className="animate-spin" aria-hidden /> : <CloudUpload aria-hidden />}
          {s?.inProgress ? t('running') : t('now')}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {s && (
          <div
            className={cn(
              'flex items-start gap-3 rounded-xl p-4 text-sm',
              tone === 'ok' && 'bg-emerald-50 text-emerald-900',
              tone === 'warn' && 'bg-amber-50 text-amber-900',
              tone === 'bad' && 'bg-red-50 text-red-900',
            )}
          >
            {tone === 'ok' ? <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />}
            <div className="flex flex-col gap-1">
              <span className="font-medium">
                {s.neverRan
                  ? t('neverRan')
                  : last
                    ? t('lastOk', { when: timeAgo(last.finishedAt ?? last.requestedAt, locale) })
                    : t('noneOk')}
              </span>
              {last && (
                <span>
                  {[
                    formatDateTime(last.finishedAt ?? last.requestedAt, locale),
                    size(last.size, locale),
                    last.offsite ? t('offsite') : t('notOffsite'),
                    last.encrypted ? t('encrypted') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
              {s.neverRan && <span>{t('neverRanHint')}</span>}
              {!s.healthy && last && <span>{t('stale')}</span>}
            </div>
          </div>
        )}
        <FormError message={now.error} />

        {s && s.runs.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {s.runs.slice(0, 8).map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
      </CardContent>
    </Card>
  );
}

function RunRow({ run }: { run: BackupRunDto }) {
  const t = useTranslations('backups');
  const locale = useLocale();
  const pill = {
    OK: 'bg-emerald-50 text-emerald-700',
    FAILED: 'bg-red-50 text-red-700',
    RUNNING: 'bg-sky-50 text-sky-700',
    REQUESTED: 'bg-muted text-muted-foreground',
  }[run.status];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', pill)}>{t(`status.${run.status}`)}</span>
      <span className="tabular-nums">{formatDateTime(run.finishedAt ?? run.requestedAt, locale)}</span>
      <span className="text-muted-foreground">
        {run.trigger === 'SCHEDULED' ? t('nightly') : run.requestedBy ? t('byPerson', { name: run.requestedBy }) : t('manual')}
      </span>
      <span className="ms-auto flex items-center gap-2 text-muted-foreground">
        {run.status === 'OK' && size(run.size, locale)}
        {run.encrypted && <Lock className="size-3.5" aria-label={t('encrypted')} />}
        {run.offsite && <CloudUpload className="size-3.5" aria-label={t('offsite')} />}
      </span>
      {run.error && <span className="w-full truncate text-xs text-red-700">{run.error}</span>}
      {run.name && run.status === 'OK' && <span className="w-full font-mono text-xs text-muted-foreground" dir="ltr">{run.name}</span>}
    </li>
  );
}
