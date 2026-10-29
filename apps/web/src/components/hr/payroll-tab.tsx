'use client';

import {
  EXPENSE_PAYMENT_METHODS,
  parseMadToCentimes,
  payrollEditSchema,
  payrollNet,
  todayIso,
  type ExpensePaymentMethod,
  type PayrollEntryDto,
  type PayrollMonthDto,
} from '@riad/shared';
import { Banknote, FileSpreadsheet, Info, Pencil, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
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
import { api, apiDownload } from '@/lib/api';
import { centimesToInput, formatDate, formatMoney } from '@/lib/format';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction, useApiQuery } from '@/lib/use-api';

const METHODS = EXPENSE_PAYMENT_METHODS.filter((m) => m !== 'PETTY_CASH');

/** Monthly payroll: draft from base salaries → adjust → pay (creates the Salaries expense). */
export function PayrollTab({ month, canWrite, onChanged }: { month: string; canWrite: boolean; onChanged: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const query = useApiQuery<PayrollMonthDto>(month ? `/hr/payroll?month=${month}` : null);
  const [editing, setEditing] = useState<PayrollEntryDto | undefined>(undefined);
  // undefined = closed, null = pay the whole month, entry = pay one line.
  const [paying, setPaying] = useState<PayrollEntryDto | null | undefined>(undefined);
  const action = useAction();
  const m = (c: number) => formatMoney(c, locale);
  const d = query.data;
  const unpaid = d?.entries.filter((e) => !e.paidAt) ?? [];

  const refresh = () => {
    query.reload();
    onChanged();
  };

  async function generate() {
    if (await action.run(() => api('/hr/payroll/generate', { method: 'POST', body: { month } }))) refresh();
  }

  async function unpay(e: PayrollEntryDto) {
    if (!window.confirm(t('hr.payroll.unpayConfirm', { name: e.employee.name }))) return;
    if (await action.run(() => api(`/hr/payroll/${e.id}/unpay`, { method: 'POST' }))) refresh();
  }

  async function remove(e: PayrollEntryDto) {
    if (!window.confirm(t('hr.payroll.deleteConfirm', { name: e.employee.name }))) return;
    if (await action.run(() => api(`/hr/payroll/${e.id}`, { method: 'DELETE' }))) refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-xl border border-teal-100 bg-teal-100/40 p-3 text-sm text-teal-900">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('hr.payroll.notice')}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {canWrite && (d?.missing ?? 0) > 0 && (
          <Button onClick={() => void generate()} disabled={action.pending}>
            <Sparkles aria-hidden />
            {d?.entries.length ? t('hr.payroll.addMissing', { count: d.missing }) : t('hr.payroll.generate')}
          </Button>
        )}
        {canWrite && unpaid.length > 0 && (
          <Button variant={d?.missing ? 'outline' : 'default'} onClick={() => setPaying(null)} disabled={action.pending}>
            <Banknote aria-hidden />
            {t('hr.payroll.payAll', { count: unpaid.length })}
          </Button>
        )}
        {d && d.entries.length > 0 && (
          <Button variant="outline" onClick={() => void action.run(() => apiDownload(`/hr/payroll/export?month=${month}`, `paie_${month}.xlsx`))}>
            <FileSpreadsheet aria-hidden />
            {t('hr.payroll.export')}
          </Button>
        )}
      </div>
      <FormError message={action.error} />

      <Card className="overflow-hidden py-0">
        {d && d.entries.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">{t('hr.payroll.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">{t('hr.employee')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('hr.payroll.base')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('hr.payroll.bonuses')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('hr.payroll.advances')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('hr.payroll.deductions')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('hr.payroll.net')}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t('hr.payroll.status')}</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {d?.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{e.employee.name}</div>
                      <div className="text-xs text-muted-foreground">{e.employee.position}</div>
                      {e.unpaidLeaveDays > 0 && (
                        <div className="text-xs text-amber-700">{t('hr.payroll.unpaidLeave', { count: e.unpaidLeaveDays })}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-end whitespace-nowrap">{m(e.baseSalary)}</td>
                    <td className="px-3 py-3 text-end whitespace-nowrap">{e.bonuses ? `+ ${m(e.bonuses)}` : '—'}</td>
                    <td className="px-3 py-3 text-end whitespace-nowrap">{e.advances ? `− ${m(e.advances)}` : '—'}</td>
                    <td className="px-3 py-3 text-end whitespace-nowrap">{e.deductions ? `− ${m(e.deductions)}` : '—'}</td>
                    <td className="px-3 py-3 text-end font-semibold whitespace-nowrap">{m(e.netPaid)}</td>
                    <td className="px-3 py-3">
                      {e.paidAt ? (
                        <Badge tone="green">{t('hr.payroll.paidOn', { date: formatDate(e.paidAt.slice(0, 10), locale, { day: 'numeric', month: 'short' }) })}</Badge>
                      ) : (
                        <Badge tone="amber">{t('hr.payroll.toPay')}</Badge>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      {canWrite && (
                        <div className="flex justify-end">
                          {e.paidAt ? (
                            <Button variant="ghost" size="sm" onClick={() => void unpay(e)} title={t('hr.payroll.unpay')} aria-label={t('hr.payroll.unpay')}>
                              <Undo2 className="size-4" />
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" onClick={() => setPaying(e)}>
                                {t('hr.payroll.pay')}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditing(e)} aria-label={t('common.edit')}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(e)} aria-label={t('common.delete')}>
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {d && d.entries.length > 0 && (
                <tfoot className="border-t-2 bg-teal-100/30 font-semibold tabular-nums">
                  <tr>
                    <td className="px-4 py-3">{t('hr.payroll.total')}</td>
                    <td className="px-3 py-3 text-end whitespace-nowrap">{m(d.totals.baseSalary)}</td>
                    <td className="px-3 py-3 text-end whitespace-nowrap">{m(d.totals.bonuses)}</td>
                    <td className="px-3 py-3 text-end whitespace-nowrap">{m(d.totals.advances)}</td>
                    <td className="px-3 py-3 text-end whitespace-nowrap">{m(d.totals.deductions)}</td>
                    <td className="px-3 py-3 text-end whitespace-nowrap">{m(d.totals.netPaid)}</td>
                    <td colSpan={2} className="px-3 py-3 text-xs font-normal text-muted-foreground">
                      {t('hr.payroll.paidSoFar', { amount: m(d.totals.paid) })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>

      <EditDialog entry={editing} onOpenChange={(o) => !o && setEditing(undefined)} onDone={refresh} />
      <PayDialog
        open={paying !== undefined}
        entry={paying ?? undefined}
        month={month}
        total={paying ? paying.netPaid : unpaid.reduce((n, e) => n + e.netPaid, 0)}
        onOpenChange={(o) => !o && setPaying(undefined)}
        onDone={refresh}
      />
    </div>
  );
}

function EditDialog({ entry, onOpenChange, onDone }: { entry?: PayrollEntryDto; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [bonuses, setBonuses] = useState('');
  const [advances, setAdvances] = useState('');
  const [deductions, setDeductions] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!entry) return;
    setBonuses(entry.bonuses ? centimesToInput(entry.bonuses) : '');
    setAdvances(entry.advances ? centimesToInput(entry.advances) : '');
    setDeductions(entry.deductions ? centimesToInput(entry.deductions) : '');
    setErrors({});
    setError(null);
  }, [entry, setError]);

  const parsed = payrollEditSchema.safeParse({ bonusesMad: bonuses, advancesMad: advances, deductionsMad: deductions });
  const c = (v: string | undefined) => (v ? parseMadToCentimes(v) : 0);
  const amounts = parsed.success
    ? { bonuses: c(parsed.data.bonusesMad), advances: c(parsed.data.advancesMad), deductions: c(parsed.data.deductionsMad) }
    : null;
  const net = entry && amounts ? payrollNet({ baseSalary: entry.baseSalary, ...amounts }) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!entry) return;
    if (!parsed.success || !amounts) return setErrors(fieldErrors(parsed.error!));
    setErrors({});
    const ok = await run(() => api(`/hr/payroll/${entry.id}`, { method: 'PATCH', body: amounts }));
    if (ok !== undefined) {
      onOpenChange(false);
      onDone();
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry?.employee.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted-foreground">{t('hr.payroll.baseIs', { amount: entry ? formatMoney(entry.baseSalary, locale) : '' })}</p>
          <FormField id="pr-bonus" label={t('hr.payroll.bonuses')} error={errors.bonusesMad}>
            <Input id="pr-bonus" inputMode="decimal" dir="ltr" value={bonuses} onChange={(e) => setBonuses(e.target.value)} placeholder="0" />
          </FormField>
          <FormField id="pr-adv" label={t('hr.payroll.advances')} error={errors.advancesMad} hint={t('hr.payroll.advancesHint')}>
            <Input id="pr-adv" inputMode="decimal" dir="ltr" value={advances} onChange={(e) => setAdvances(e.target.value)} placeholder="0" />
          </FormField>
          <FormField
            id="pr-ded"
            label={t('hr.payroll.deductions')}
            error={errors.deductionsMad}
            hint={entry?.unpaidLeaveDays ? t('hr.payroll.deductionsLeaveHint', { count: entry.unpaidLeaveDays }) : t('hr.payroll.deductionsHint')}
          >
            <Input id="pr-ded" inputMode="decimal" dir="ltr" value={deductions} onChange={(e) => setDeductions(e.target.value)} placeholder="0" />
          </FormField>
          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
            <span className="font-medium">{t('hr.payroll.net')}</span>
            <span className={net !== null && net < 0 ? 'font-semibold text-destructive' : 'font-semibold tabular-nums'}>
              {net === null ? '—' : formatMoney(net, locale)}
            </span>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || (net !== null && net < 0)}>
              {pending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({
  open,
  entry,
  month,
  total,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  entry?: PayrollEntryDto;
  month: string;
  total: number;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState<ExpensePaymentMethod>('TRANSFER');
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    setDate(todayIso());
    setMethod('TRANSFER');
    setError(null);
  }, [open, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { date, paymentMethod: method };
    const ok = await run(() =>
      entry
        ? api(`/hr/payroll/${entry.id}/pay`, { method: 'POST', body })
        : api('/hr/payroll/pay-month', { method: 'POST', body: { ...body, month } }),
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
          <DialogTitle>{entry ? t('hr.payroll.payOne', { name: entry.employee.name }) : t('hr.payroll.payMonth')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
            <span className="font-medium">{t('hr.payroll.net')}</span>
            <span className="text-lg font-semibold tabular-nums">{formatMoney(total, locale)}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="pay-date" label={t('hr.payroll.payDate')}>
              <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            <FormField id="pay-method" label={t('expenses.method')}>
              <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as ExpensePaymentMethod)}>
                {METHODS.map((x) => (
                  <option key={x} value={x}>
                    {t(`expenseMethod.${x}`)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <p className="text-sm text-muted-foreground">{t('hr.payroll.payHint')}</p>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !date}>
              {pending ? t('common.saving') : t('hr.payroll.confirmPay')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
