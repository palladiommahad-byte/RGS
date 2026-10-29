'use client';

import {
  LEAVE_STATUSES,
  LEAVE_TYPES,
  leaveFormSchema,
  todayIso,
  type EmployeeDto,
  type LeaveDto,
  type LeaveStatus,
  type LeaveType,
  type Paginated,
} from '@riad/shared';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form-field';
import { Pagination } from '@/components/pagination';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const LIMIT = 20;
const STATUS_TONE: Record<LeaveStatus, BadgeTone> = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'gray' };

/** Leave requests recorded by a manager, then approved or rejected. */
export function LeavesTab({ canWrite, onChanged }: { canWrite: boolean; onChanged: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [status, setStatus] = useState<LeaveStatus | ''>('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LeaveDto | null | undefined>(undefined);
  const action = useAction();
  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (status) params.set('status', status);
  const query = useApiQuery<Paginated<LeaveDto>>(`/hr/leaves?${params}`);
  const employees = useApiQuery<Paginated<EmployeeDto>>(canWrite ? '/hr/employees?limit=100' : null);

  const refresh = () => {
    query.reload();
    onChanged();
  };

  async function decide(l: LeaveDto, verb: 'approve' | 'reject') {
    if (await action.run(() => api(`/hr/leaves/${l.id}/${verb}`, { method: 'POST' }))) refresh();
  }

  async function remove(l: LeaveDto) {
    if (!window.confirm(t('hr.leaves.deleteConfirm'))) return;
    if (await action.run(() => api(`/hr/leaves/${l.id}`, { method: 'DELETE' }))) refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 pb-1">
          {(['', ...LEAVE_STATUSES] as const).map((s) => (
            <button
              key={s || 'all'}
              type="button"
              aria-pressed={status === s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              className={cn(
                'h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                status === s ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {s ? t(`leaveStatus.${s}`) : t('hr.leaves.all')}
            </button>
          ))}
        </div>
        {canWrite && (
          <Button onClick={() => setEditing(null)}>
            <Plus aria-hidden />
            {t('hr.leaves.new')}
          </Button>
        )}
      </div>
      <FormError message={action.error} />

      <Card className="py-0">
        {query.data?.items.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">{t('hr.leaves.empty')}</p>
        ) : (
          <ul className="divide-y">
            {query.data?.items.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{l.employee.name}</span>
                    <Badge tone={STATUS_TONE[l.status]}>{t(`leaveStatus.${l.status}`)}</Badge>
                  </div>
                  <div className="text-sm">
                    {t(`leaveType.${l.type}`)} · {t('hr.leaves.range', { from: formatDate(l.startDate, locale), to: formatDate(l.endDate, locale) })} ·{' '}
                    {t('hr.leaves.days', { count: l.days })}
                  </div>
                  {(l.note || l.decidedBy) && (
                    <div className="text-xs text-muted-foreground">
                      {l.note}
                      {l.note && l.decidedBy && ' · '}
                      {l.decidedBy && t('hr.leaves.decidedBy', { name: l.decidedBy.name })}
                    </div>
                  )}
                </div>
                {canWrite && (
                  <div className="flex flex-wrap gap-1">
                    {l.status === 'PENDING' && (
                      <>
                        <Button size="sm" onClick={() => void decide(l, 'approve')} disabled={action.pending}>
                          <Check aria-hidden />
                          {t('hr.leaves.approve')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void decide(l, 'reject')} disabled={action.pending}>
                          <X aria-hidden />
                          {t('hr.leaves.reject')}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setEditing(l)} aria-label={t('common.edit')}>
                          <Pencil className="size-4" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(l)} aria-label={t('common.delete')}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {query.data && <Pagination page={page} limit={LIMIT} total={query.data.total} onPage={setPage} />}

      <LeaveDialog
        open={editing !== undefined}
        leave={editing ?? undefined}
        employees={employees.data?.items ?? []}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onDone={refresh}
      />
    </div>
  );
}

function LeaveDialog({
  open,
  leave,
  employees,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  leave?: LeaveDto;
  employees: EmployeeDto[];
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState<LeaveType>('ANNUAL');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    setEmployeeId(leave?.employee.id ?? '');
    setType(leave?.type ?? 'ANNUAL');
    setStartDate(leave?.startDate ?? todayIso());
    setEndDate(leave?.endDate ?? todayIso());
    setNote(leave?.note ?? '');
    setErrors({});
    setError(null);
  }, [open, leave, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = leaveFormSchema.safeParse({ employeeId, type, startDate, endDate, note });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const v = parsed.data;
    const ok = await run(() =>
      leave
        ? api(`/hr/leaves/${leave.id}`, { method: 'PATCH', body: { type: v.type, startDate: v.startDate, endDate: v.endDate, note: v.note } })
        : api('/hr/leaves', { method: 'POST', body: v }),
    );
    if (ok !== undefined) {
      onOpenChange(false);
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{leave ? t('hr.leaves.edit') : t('hr.leaves.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField id="lv-emp" label={t('hr.employee')} error={errors.employeeId}>
            <Select id="lv-emp" value={employeeId} disabled={!!leave} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">—</option>
              {employees.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.firstName} {x.lastName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="lv-type" label={t('hr.leaves.type')}>
            <Select id="lv-type" value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
              {LEAVE_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`leaveType.${x}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="lv-start" label={t('hr.leaves.start')} error={errors.startDate}>
              <Input id="lv-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </FormField>
            <FormField id="lv-end" label={t('hr.leaves.end')} error={errors.endDate}>
              <Input id="lv-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </FormField>
          </div>
          <FormField id="lv-note" label={t('hr.leaves.note')} error={errors.note}>
            <Textarea id="lv-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
