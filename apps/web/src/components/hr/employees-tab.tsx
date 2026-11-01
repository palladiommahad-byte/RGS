'use client';

import {
  CONTRACT_TYPES,
  employeeFormSchema,
  parseMadToCentimes,
  todayIso,
  type ContractType,
  type EmployeeDto,
  type Paginated,
} from '@riad/shared';
import { FileText, Pencil, Plus, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form-field';
import { Pagination } from '@/components/pagination';
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
import { api, apiUpload } from '@/lib/api';
import { centimesToInput, formatDate, formatMoney } from '@/lib/format';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const LIMIT = 20;

export function EmployeesTab({ canWrite, onChanged }: { canWrite: boolean; onChanged: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<EmployeeDto | null | undefined>(undefined);
  const action = useAction();

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (debounced) params.set('search', debounced);
  if (includeInactive) params.set('includeInactive', 'true');
  const query = useApiQuery<Paginated<EmployeeDto>>(`/hr/employees?${params}`);

  const refresh = () => {
    query.reload();
    onChanged();
  };

  async function openContract(e: EmployeeDto) {
    const res = await action.run(() => api<{ url: string }>(`/hr/employees/${e.id}/contract`));
    if (res) window.open(res.url, '_blank', 'noopener');
  }

  async function remove(e: EmployeeDto) {
    if (!window.confirm(t('hr.employees.deleteConfirm', { name: `${e.firstName} ${e.lastName}` }))) return;
    if (await action.run(() => api(`/hr/employees/${e.id}`, { method: 'DELETE' }))) refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('hr.employees.search')}
            aria-label={t('hr.employees.search')}
            className="ps-9"
          />
        </div>
        <label className="flex h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked);
              setPage(1);
            }}
          />
          {t('hr.employees.includeInactive')}
        </label>
        {canWrite && (
          <Button onClick={() => setEditing(null)}>
            <Plus aria-hidden />
            {t('hr.employees.new')}
          </Button>
        )}
      </div>
      <FormError message={action.error} />

      <Card className="py-0">
        {query.data?.items.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">{t('hr.employees.empty')}</p>
        ) : (
          <ul className="divide-y">
            {query.data?.items.map((e) => (
              <li key={e.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3', !e.isActive && 'opacity-60')}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900" aria-hidden>
                  {e.firstName[0]}
                  {e.lastName[0]}
                </span>
                <div className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {e.firstName} {e.lastName}
                    </span>
                    {!e.isActive && <Badge tone="gray">{t('hr.employees.inactive')}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {e.position} · {t(`contractType.${e.contractType}`)} · {t('hr.employees.since', { date: formatDate(e.hireDate, locale) })}
                  </div>
                </div>
                <span className="me-auto ps-[3.25rem] sm:me-0 sm:ps-0 sm:text-end">
                  <span className="block font-semibold whitespace-nowrap tabular-nums">{formatMoney(e.baseSalary, locale)}</span>
                  <span className="block text-xs text-muted-foreground">{t('hr.employees.perMonth')}</span>
                </span>
                <div className="flex">
                  {e.hasContract && (
                    <Button variant="ghost" size="icon" onClick={() => void openContract(e)} aria-label={t('hr.employees.viewContract')} title={t('hr.employees.viewContract')}>
                      <FileText className="size-4" />
                    </Button>
                  )}
                  {canWrite && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(e)} aria-label={t('common.edit')}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(e)} aria-label={t('common.delete')}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {query.data && <Pagination page={page} limit={LIMIT} total={query.data.total} onPage={setPage} />}

      <EmployeeDialog
        open={editing !== undefined}
        employeeId={editing?.id}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onDone={refresh}
      />
    </div>
  );
}

function EmployeeDialog({
  open,
  employeeId,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  employeeId?: string;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  // The single-employee endpoint is the only one that returns the decrypted CIN.
  const detail = useApiQuery<EmployeeDto>(open && employeeId ? `/hr/employees/${employeeId}` : null);
  const employee = employeeId ? detail.data : undefined;
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    cin: '',
    cnssNumber: '',
    phone: '',
    position: '',
    contractType: 'CDI' as ContractType,
    hireDate: todayIso(),
    baseSalaryMad: '',
    isActive: true,
  });
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();
  const [badgeInfo, setBadgeInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      firstName: employee?.firstName ?? '',
      lastName: employee?.lastName ?? '',
      cin: employee?.cin ?? '',
      cnssNumber: employee?.cnssNumber ?? '',
      phone: employee?.phone ?? '',
      position: employee?.position ?? '',
      contractType: employee?.contractType ?? 'CDI',
      hireDate: employee?.hireDate ?? todayIso(),
      baseSalaryMad: employee ? centimesToInput(employee.baseSalary) : '',
      isActive: employee?.isActive ?? true,
    });
    setFile(null);
    setErrors({});
    setError(null);
    setBadgeInfo(null);
  }, [open, employee, setError]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = employeeFormSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const v = parsed.data;
    const body = {
      firstName: v.firstName,
      lastName: v.lastName,
      // "" clears these on update.
      cin: v.cin ?? '',
      cnssNumber: v.cnssNumber ?? '',
      phone: v.phone ?? '',
      position: v.position,
      contractType: v.contractType,
      hireDate: v.hireDate,
      baseSalary: parseMadToCentimes(v.baseSalaryMad),
      ...(employeeId ? { isActive: form.isActive } : {}),
    };
    const saved = await run(async () => {
      const res = employeeId
        ? await api<EmployeeDto>(`/hr/employees/${employeeId}`, { method: 'PATCH', body })
        : await api<EmployeeDto>('/hr/employees', { method: 'POST', body });
      if (file) {
        const data = new FormData();
        data.append('file', file);
        await apiUpload(`/hr/employees/${res.id}/contract`, data);
      }
      return res;
    });
    if (saved) {
      onOpenChange(false);
      onDone();
    }
  }

  async function rotateBadge() {
    if (!employeeId || !window.confirm(t('hr.employees.rotateConfirm'))) return;
    if (await run(() => api(`/hr/employees/${employeeId}/badge/rotate`, { method: 'POST' }))) setBadgeInfo(t('hr.employees.rotated'));
  }

  const loading = !!employeeId && !detail.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employeeId ? t('hr.employees.edit') : t('hr.employees.new')}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="py-6 text-center text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="grid grid-cols-2 gap-4">
              <FormField id="emp-first" label={t('hr.employees.firstName')} error={errors.firstName}>
                <Input id="emp-first" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="off" />
              </FormField>
              <FormField id="emp-last" label={t('hr.employees.lastName')} error={errors.lastName}>
                <Input id="emp-last" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="off" />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField id="emp-position" label={t('hr.employees.position')} error={errors.position}>
                <Input id="emp-position" value={form.position} onChange={(e) => set('position', e.target.value)} />
              </FormField>
              <FormField id="emp-contract" label={t('hr.employees.contractType')}>
                <Select id="emp-contract" value={form.contractType} onChange={(e) => set('contractType', e.target.value as ContractType)}>
                  {CONTRACT_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {t(`contractType.${c}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField id="emp-hire" label={t('hr.employees.hireDate')} error={errors.hireDate}>
                <Input id="emp-hire" type="date" value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
              </FormField>
              <FormField id="emp-salary" label={t('hr.employees.baseSalary')} error={errors.baseSalaryMad}>
                <Input id="emp-salary" inputMode="decimal" dir="ltr" value={form.baseSalaryMad} onChange={(e) => set('baseSalaryMad', e.target.value)} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField id="emp-cin" label={t('hr.employees.cin')} error={errors.cin} hint={t('hr.employees.cinHint')}>
                <Input id="emp-cin" dir="ltr" value={form.cin} onChange={(e) => set('cin', e.target.value.toUpperCase())} autoComplete="off" />
              </FormField>
              <FormField id="emp-cnss" label={t('hr.employees.cnss')} error={errors.cnssNumber}>
                <Input id="emp-cnss" dir="ltr" inputMode="numeric" value={form.cnssNumber} onChange={(e) => set('cnssNumber', e.target.value)} />
              </FormField>
            </div>
            <FormField id="emp-phone" label={t('hr.employees.phone')} error={errors.phone}>
              <Input id="emp-phone" type="tel" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </FormField>
            <FormField id="emp-file" label={t('hr.employees.contractFile')} hint={employee?.hasContract ? t('hr.employees.contractReplace') : t('hr.employees.contractHint')}>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                  <Upload aria-hidden />
                  {t('hr.employees.chooseFile')}
                </Button>
                <span className="min-w-0 truncate text-sm text-muted-foreground">{file?.name}</span>
                <input
                  ref={fileInput}
                  id="emp-file"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </FormField>
            {employeeId && (
              <div className="flex flex-col gap-3 rounded-lg border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
                  {t('hr.employees.active')}
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => void rotateBadge()}>
                    <RefreshCw aria-hidden />
                    {t('hr.employees.rotate')}
                  </Button>
                  {badgeInfo && <span className="text-sm text-emerald-700">{badgeInfo}</span>}
                </div>
              </div>
            )}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
