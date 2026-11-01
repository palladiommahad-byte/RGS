'use client';

import { attendanceFormSchema, type AttendanceRecordDto, type AttendanceReportDto } from '@riad/shared';
import { ChevronDown, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
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
import { api } from '@/lib/api';
import { formatDate, formatMinutes, formatTime, fromRiadInput, toRiadInput } from '@/lib/format';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

type Editing = { record?: AttendanceRecordDto; employeeId?: string };

/** Monthly attendance per employee, with manual corrections (forgotten scans). */
export function AttendanceTab({ month, canWrite }: { month: string; canWrite: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const query = useApiQuery<AttendanceReportDto>(month ? `/hr/attendance?month=${month}` : null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | undefined>(undefined);
  const action = useAction();
  const rows = query.data?.employees ?? [];

  async function remove(r: AttendanceRecordDto) {
    if (!window.confirm(t('hr.attendance.deleteConfirm'))) return;
    if (await action.run(() => api(`/hr/attendance/${r.id}`, { method: 'DELETE' }))) query.reload();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('hr.attendance.hint')}</p>
        {canWrite && (
          <Button onClick={() => setEditing({})}>
            <Plus aria-hidden />
            {t('hr.attendance.add')}
          </Button>
        )}
      </div>
      <FormError message={action.error} />

      <Card className="overflow-hidden py-0">
        {query.data && rows.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">{t('hr.attendance.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/40 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">{t('hr.employee')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('hr.attendance.days')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('hr.attendance.hours')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('hr.attendance.leaveDays')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('hr.attendance.open')}</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {rows.map((row) => {
                  const open = expanded === row.employee.id;
                  return (
                    <Fragment key={row.employee.id}>
                      <tr className="cursor-pointer hover:bg-accent/50" onClick={() => setExpanded(open ? null : row.employee.id)}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.employee.name}</div>
                          <div className="text-xs text-muted-foreground">{row.employee.position}</div>
                        </td>
                        <td className="px-3 py-3 text-end">{row.daysWorked}</td>
                        <td className="px-3 py-3 text-end font-medium">{formatMinutes(row.minutes)}</td>
                        <td className="px-3 py-3 text-end">{row.leaveDays || '—'}</td>
                        <td className="px-3 py-3 text-end">
                          {row.openShifts > 0 ? <Badge tone="amber">{row.openShifts}</Badge> : '—'}
                        </td>
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            className="flex size-9 items-center justify-center rounded-lg hover:bg-accent"
                            aria-expanded={open}
                            aria-label={t('hr.attendance.details', { name: row.employee.name })}
                          >
                            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={6} className="bg-muted/30 px-4 py-3">
                            {row.records.length === 0 ? (
                              <p className="text-muted-foreground">{t('hr.attendance.noScans')}</p>
                            ) : (
                              <ul className="flex flex-col divide-y">
                                {row.records.map((r) => (
                                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-1.5">
                                    <span className="w-32 text-muted-foreground">{formatDate(r.date, locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                                    <span dir="ltr">
                                      {formatTime(r.checkInAt, locale)} → {r.checkOutAt ? formatTime(r.checkOutAt, locale) : '…'}
                                    </span>
                                    <span className="flex-1 font-medium">
                                      {r.minutes !== null ? (
                                        formatMinutes(r.minutes)
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-amber-700">
                                          <TriangleAlert className="size-3.5" aria-hidden />
                                          {t('hr.attendance.noCheckOut')}
                                        </span>
                                      )}
                                    </span>
                                    {canWrite && (
                                      <span className="flex">
                                        <Button variant="ghost" size="sm" onClick={() => setEditing({ record: r })} aria-label={t('common.edit')}>
                                          <Pencil className="size-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(r)} aria-label={t('common.delete')}>
                                          <Trash2 className="size-4" />
                                        </Button>
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {canWrite && (
                              <Button variant="outline" size="sm" className="mt-2" onClick={() => setEditing({ employeeId: row.employee.id })}>
                                <Plus aria-hidden />
                                {t('hr.attendance.add')}
                              </Button>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AttendanceDialog
        editing={editing}
        employees={rows.map((r) => r.employee)}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onDone={query.reload}
      />
    </div>
  );
}

function AttendanceDialog({
  editing,
  employees,
  onOpenChange,
  onDone,
}: {
  editing: Editing | undefined;
  employees: { id: string; name: string }[];
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const open = editing !== undefined;
  const record = editing?.record;
  const [employeeId, setEmployeeId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!editing) return;
    setEmployeeId(editing.record?.employeeId ?? editing.employeeId ?? '');
    setCheckIn(editing.record ? toRiadInput(editing.record.checkInAt) : '');
    setCheckOut(editing.record?.checkOutAt ? toRiadInput(editing.record.checkOutAt) : '');
    setErrors({});
    setError(null);
  }, [editing, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = attendanceFormSchema.safeParse({ employeeId, checkInAt: checkIn, checkOutAt: checkOut });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const times = { checkInAt: fromRiadInput(checkIn), checkOutAt: checkOut ? fromRiadInput(checkOut) : null };
    const ok = await run(() =>
      record
        ? api(`/hr/attendance/${record.id}`, { method: 'PATCH', body: times })
        : api('/hr/attendance', { method: 'POST', body: { employeeId, ...times } }),
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
          <DialogTitle>{record ? t('hr.attendance.edit') : t('hr.attendance.add')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField id="att-emp" label={t('hr.employee')} error={errors.employeeId}>
            <Select id="att-emp" value={employeeId} disabled={!!record} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">—</option>
              {employees.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="att-in" label={t('hr.attendance.checkIn')} error={errors.checkInAt}>
            <Input id="att-in" type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </FormField>
          <FormField id="att-out" label={t('hr.attendance.checkOut')} error={errors.checkOutAt} hint={t('hr.attendance.checkOutHint')}>
            <Input id="att-out" type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
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
