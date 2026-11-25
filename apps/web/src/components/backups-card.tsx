'use client';

import { RESTORE_CONFIRM_WORD, type BackupRunDto, type BackupStatusDto } from '@riad/shared';
import {
  CircleAlert,
  CircleCheck,
  Clock,
  CloudUpload,
  DatabaseBackup,
  History,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { FormError } from '@/components/form-field';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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

/** Owner's view of the backups: last good one, off-site copy, history, "Back up now", restore. */
export function BackupsCard() {
  const t = useTranslations('backups');
  const locale = useLocale();
  const query = useApiQuery<BackupStatusDto>('/backups');
  const now = useAction();
  const [restoreOpen, setRestoreOpen] = useState(false);
  // Set once a restore was asked for here: the API restarts, so requests may fail for a while.
  const [restoreAsked, setRestoreAsked] = useState(false);
  const s = query.data;
  const { reload } = query;
  const restoring = restoreAsked || !!s?.restoring;

  // While a backup or a restore waits or runs, refresh until it is done.
  useEffect(() => {
    if (!s?.inProgress && !restoreAsked) return;
    const id = setInterval(reload, POLL_MS);
    return () => clearInterval(id);
  }, [s?.inProgress, restoreAsked, reload]);

  async function backUpNow() {
    if (await now.run(() => api('/backups', { method: 'POST' }), { success: 'backupStarted' })) reload();
  }

  const last = s?.lastOk;
  const tone = !s ? 'muted' : s.healthy ? (last?.offsite ? 'ok' : 'warn') : 'bad';
  const StatusIcon = tone === 'ok' ? ShieldCheck : tone === 'warn' ? TriangleAlert : CircleAlert;

  return (
    <SettingsSection
      icon={DatabaseBackup}
      tone="sky"
      title={t('title')}
      hint={t('sectionHint')}
      className="flex flex-col gap-4"
      actions={
        <Button type="button" variant="outline" onClick={() => void backUpNow()} disabled={!s || s.inProgress || now.pending || restoring}>
          {s?.inProgress && !s.restoring ? <Loader2 className="animate-spin" aria-hidden /> : <CloudUpload className="text-sky-600" aria-hidden />}
          {s?.inProgress && !s.restoring ? t('running') : t('now')}
        </Button>
      }
    >
      {restoring && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin" aria-hidden />
          <div className="flex flex-col gap-1">
            <span className="font-semibold">{t('restoringTitle')}</span>
            <span>{t('restoringHint')}</span>
          </div>
        </div>
      )}

      {s && (
        <div
          className={cn(
            'flex items-start gap-3 rounded-xl p-4 text-sm',
            tone === 'ok' && 'bg-emerald-50 text-emerald-900',
            tone === 'warn' && 'bg-amber-50 text-amber-900',
            tone === 'bad' && 'bg-red-50 text-red-900',
          )}
        >
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl',
              tone === 'ok' && 'bg-emerald-100 text-emerald-700',
              tone === 'warn' && 'bg-amber-100 text-amber-700',
              tone === 'bad' && 'bg-red-100 text-red-700',
            )}
            aria-hidden
          >
            <StatusIcon className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="font-semibold">
              {s.neverRan ? t('neverRan') : last ? t('lastOk', { when: timeAgo(last.finishedAt ?? last.requestedAt, locale) }) : t('noneOk')}
            </span>
            {last && (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="tabular-nums">{formatDateTime(last.finishedAt ?? last.requestedAt, locale)}</span>
                <span>{size(last.size, locale)}</span>
                <span className="inline-flex items-center gap-1">
                  <CloudUpload className={cn('size-3.5', last.offsite ? 'text-sky-600' : 'text-red-600')} aria-hidden />
                  {last.offsite ? t('offsite') : t('notOffsite')}
                </span>
                {last.encrypted && (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="size-3.5 text-violet-600" aria-hidden />
                    {t('encrypted')}
                  </span>
                )}
              </span>
            )}
            {s.neverRan && <span>{t('neverRanHint')}</span>}
            {!s.healthy && last && <span>{t('stale')}</span>}
          </div>
        </div>
      )}
      <FormError message={now.error} />

      {/* Restore: only owners, only when there is a good backup. */}
      {s?.canRestore && last?.name && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/40 p-4 sm:flex-row sm:items-center">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700" aria-hidden>
            <RotateCcw className="size-5" />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">{t('restoreTitle')}</div>
            <div className="text-muted-foreground">{t('restoreHint', { date: formatDateTime(last.finishedAt ?? last.requestedAt, locale) })}</div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
            onClick={() => setRestoreOpen(true)}
            disabled={restoring || s.inProgress}
          >
            <RotateCcw aria-hidden />
            {t('restoreButton')}
          </Button>
        </div>
      )}

      {s && s.runs.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <History className="size-4 text-teal-700" aria-hidden />
            {t('history')}
          </h3>
          <ul className="divide-y rounded-xl border">
            {s.runs.slice(0, 8).map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('hint')}</p>

      {last?.name && (
        <RestoreDialog
          backup={last}
          open={restoreOpen}
          onOpenChange={setRestoreOpen}
          onDone={() => {
            setRestoreAsked(true);
            reload();
          }}
        />
      )}
    </SettingsSection>
  );
}

const RUN_ICON = {
  OK: { icon: CircleCheck, className: 'text-emerald-600' },
  FAILED: { icon: XCircle, className: 'text-red-600' },
  RUNNING: { icon: Loader2, className: 'animate-spin text-sky-600' },
  REQUESTED: { icon: Clock, className: 'text-muted-foreground' },
} as const;

function RunRow({ run }: { run: BackupRunDto }) {
  const t = useTranslations('backups');
  const locale = useLocale();
  const restore = run.trigger === 'RESTORE';
  const { icon: Icon, className } = RUN_ICON[run.status];
  const pill = {
    OK: 'bg-emerald-50 text-emerald-700',
    FAILED: 'bg-red-50 text-red-700',
    RUNNING: 'bg-sky-50 text-sky-700',
    REQUESTED: 'bg-muted text-muted-foreground',
  }[run.status];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
      {restore ? <RotateCcw className="size-4 shrink-0 text-violet-600" aria-hidden /> : <Icon className={cn('size-4 shrink-0', className)} aria-hidden />}
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', pill)}>{t(`status.${run.status}`)}</span>
      <span className="tabular-nums">{formatDateTime(run.finishedAt ?? run.requestedAt, locale)}</span>
      <span className="text-muted-foreground">
        {restore
          ? t('restoreOf', { name: run.name ?? '' })
          : run.trigger === 'SCHEDULED'
            ? t('nightly')
            : run.requestedBy
              ? t('byPerson', { name: run.requestedBy })
              : t('manual')}
      </span>
      {!restore && (
        <span className="ms-auto flex items-center gap-2 text-muted-foreground">
          {run.status === 'OK' && size(run.size, locale)}
          {run.encrypted && <Lock className="size-3.5 text-violet-600" aria-label={t('encrypted')} />}
          {run.offsite && <CloudUpload className="size-3.5 text-sky-600" aria-label={t('offsite')} />}
        </span>
      )}
      {run.error && <span className="w-full truncate text-xs text-red-700">{run.error}</span>}
      {!restore && run.name && run.status === 'OK' && (
        <span className="w-full font-mono text-xs text-muted-foreground" dir="ltr">
          {run.name}
        </span>
      )}
    </li>
  );
}

/** "Type RESTORE": the owner confirms replacing every record and file with this backup. */
function RestoreDialog({
  backup,
  open,
  onOpenChange,
  onDone,
}: {
  backup: BackupRunDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations('backups');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [word, setWord] = useState('');
  const { run, pending, error, setError } = useAction();
  const ready = word.trim() === RESTORE_CONFIRM_WORD;

  useEffect(() => {
    if (!open) return;
    setWord('');
    setError(null);
  }, [open, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const ok = await run(() => api('/backups/restore', { method: 'POST', body: { name: backup.name, confirm: word.trim() } }));
    if (ok) {
      onOpenChange(false);
      onDone();
    }
  }

  const date = formatDateTime(backup.finishedAt ?? backup.requestedAt, locale);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600" aria-hidden>
              <TriangleAlert className="size-6" />
            </span>
            <div className="min-w-0 pt-1">
              <DialogTitle>{t('restoreDialogTitle', { date })}</DialogTitle>
              <DialogDescription className="mt-1.5">{t('restoreDialogLead')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex gap-2">
              <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
              {t('restoreLoses', { date })}
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              {t('restoreSafety')}
            </li>
            <li className="flex gap-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden />
              {t('restoreTime')}
            </li>
          </ul>
          <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="restore-word">
            {t('restoreType', { word: RESTORE_CONFIRM_WORD })}
            <Input
              id="restore-word"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder={RESTORE_CONFIRM_WORD}
              className="font-mono tracking-widest"
            />
          </label>
          <FormError message={error} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={!ready || pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
              {t('restoreConfirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
