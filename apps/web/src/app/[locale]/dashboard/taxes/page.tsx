'use client';

import {
  parseMadToCentimes,
  TAX_CODES,
  TAX_MODES,
  taxSettingFormSchema,
  todayIso,
  type TaxCode,
  type TaxMode,
  type TaxReportDto,
  type TaxSettingDto,
} from '@riad/shared';
import { FileSpreadsheet, Landmark, Pencil, Plus, Receipt, Trash2, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { FormError, FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export default function TaxesPage() {
  const t = useTranslations('taxes');
  const tc = useTranslations();
  const locale = useLocale();
  const { can } = useAuth();
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const report = useApiQuery<TaxReportDto>(can('finance.reports') && month ? `/tax-report?month=${month}` : null);
  const settings = useApiQuery<TaxSettingDto[]>('/tax-settings');
  const [editing, setEditing] = useState<TaxSettingDto | null | undefined>(undefined);
  const action = useAction();
  const m = (c: number) => formatMoney(c, locale);
  const r = report.data;

  const value = (s: Pick<TaxSettingDto, 'mode' | 'value'>) =>
    s.mode === 'PERCENT' ? `${(s.value / 100).toLocaleString(locale)} %` : t('perPersonNight', { amount: m(s.value) });
  const today = todayIso();
  const inForce = (s: TaxSettingDto) => s.validFrom <= today && (!s.validTo || s.validTo >= today);

  async function remove(s: TaxSettingDto) {
    if (!window.confirm(t('deleteConfirm', { code: tc(`taxCode.${s.code}`) }))) return;
    if (await action.run(() => api(`/tax-settings/${s.id}`, { method: 'DELETE' }))) settings.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={tc('nav.taxes')} />

      <p className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        {t('accountantBanner')}
      </p>

      {can('finance.reports') && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>{t('report')}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="month" aria-label={t('month')} value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
              <Button
                onClick={() => void action.run(() => apiDownload(`/tax-report/export?month=${month}`, `declaration-taxes_${month}.xlsx`))}
                disabled={!month || action.pending}
              >
                <FileSpreadsheet aria-hidden />
                {t('exportAccountant')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {r && (
              <>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatCard
                    highlight
                    icon={Landmark}
                    label={r.tvaDue >= 0 ? t('tvaDue') : t('tvaCredit')}
                    value={m(Math.abs(r.tvaDue))}
                    footnote={t('tvaDueFormula')}
                  />
                  <StatCard icon={Receipt} label={t('tvaCollected')} value={m(r.tvaCollected)} footnote={t('invoices', { count: r.invoiceCount })} />
                  <StatCard icon={Receipt} label={t('tvaDeductible')} value={m(r.tvaDeductible)} footnote={t('expensesWithTva', { count: r.expenseCount })} />
                  <StatCard icon={Landmark} label={t('taxeSejour')} value={m(r.taxeSejour)} footnote={t('toCommune')} />
                </div>
                <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  <Row label={t('totalHt')} value={m(r.totalHt)} />
                  <Row label={tc('bill.tpt')} value={m(r.tpt)} />
                  {r.tvaByRate.map((g) => (
                    <Row key={g.rate} label={t('tvaAtRate', { rate: `${g.rate / 100} %`, base: m(g.base) })} value={m(g.tva)} />
                  ))}
                  <Row label={t('totalTtc')} value={m(r.totalTtc)} />
                </dl>
                <p className="text-xs text-muted-foreground">{t('reportNote')}</p>
              </>
            )}
            <FormError message={action.error} />
          </CardContent>
        </Card>
      )}

      <Card className="pb-0">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t('rates')}</CardTitle>
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus aria-hidden />
            {t('newRate')}
          </Button>
        </CardHeader>
        <p className="px-5 text-sm text-muted-foreground">{t('ratesHint')}</p>
        <ul className="mt-2 divide-y border-t">
          {settings.data?.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{tc(`taxCode.${s.code}`)}</span>
                  {inForce(s) ? <Badge tone="green">{t('inForce')}</Badge> : <Badge tone="gray">{s.validFrom > today ? t('upcoming') : t('expired')}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.validTo
                    ? t('validBetween', { from: formatDate(s.validFrom, locale), to: formatDate(s.validTo, locale) })
                    : t('validSince', { from: formatDate(s.validFrom, locale) })}
                </div>
              </div>
              <span className="me-auto font-semibold whitespace-nowrap tabular-nums sm:me-0">{value(s)}</span>
              <Button variant="ghost" size="icon" onClick={() => setEditing(s)} aria-label={tc('common.edit')}>
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(s)} aria-label={tc('common.delete')}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
          {settings.data?.length === 0 && <li className="px-5 py-4 text-sm text-muted-foreground">{t('noRates')}</li>}
        </ul>
        {(() => {
          const missing = TAX_CODES.filter((c) => !settings.data?.some((s) => s.code === c && inForce(s)));
          return missing.length > 0 && settings.data ? (
            <p className="m-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {t('missing', { codes: missing.map((c) => tc(`taxCode.${c}`)).join(', ') })}
            </p>
          ) : null;
        })()}
      </Card>

      <TaxSettingDialog
        open={editing !== undefined}
        setting={editing ?? undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onDone={() => {
          settings.reload();
          report.reload();
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function TaxSettingDialog({
  open,
  setting,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  setting?: TaxSettingDto;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations('taxes');
  const tc = useTranslations();
  const [code, setCode] = useState<TaxCode>('TAXE_SEJOUR');
  const [mode, setMode] = useState<TaxMode>('PER_PERSON_PER_NIGHT');
  const [value, setValue] = useState('');
  const [validFrom, setValidFrom] = useState(todayIso());
  const [validTo, setValidTo] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();
  const isTva = code.startsWith('TVA');

  useEffect(() => {
    if (!open) return;
    setCode(setting?.code ?? 'TAXE_SEJOUR');
    setMode(setting?.mode ?? 'PER_PERSON_PER_NIGHT');
    setValue(setting ? centimesToInput(setting.value) : '');
    setValidFrom(setting?.validFrom ?? todayIso());
    setValidTo(setting?.validTo ?? '');
    setErrors({});
    setError(null);
  }, [open, setting, setError]);

  useEffect(() => {
    if (isTva) setMode('PERCENT');
  }, [isTva]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = taxSettingFormSchema.safeParse({ code, mode, value, validFrom, validTo });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    // "10" % -> 1000 basis points; "25,50" MAD -> 2550 centimes: same conversion.
    const body = { code, mode, value: parseMadToCentimes(parsed.data.value), validFrom, validTo: validTo || null };
    const ok = await run(() =>
      setting ? api(`/tax-settings/${setting.id}`, { method: 'PATCH', body }) : api('/tax-settings', { method: 'POST', body }),
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
          <DialogTitle>{setting ? t('editRate') : t('newRate')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField id="tx-code" label={t('tax')}>
            <Select id="tx-code" value={code} onChange={(e) => setCode(e.target.value as TaxCode)}>
              {TAX_CODES.map((c) => (
                <option key={c} value={c}>
                  {tc(`taxCode.${c}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="tx-mode" label={t('mode')}>
            <Select id="tx-mode" value={mode} disabled={isTva} onChange={(e) => setMode(e.target.value as TaxMode)}>
              {TAX_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`modes.${m}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="tx-value" label={mode === 'PERCENT' ? t('valuePercent') : t('valueAmount')} error={errors.value}>
            <Input id="tx-value" inputMode="decimal" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="tx-from" label={t('validFrom')} error={errors.validFrom}>
              <Input id="tx-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </FormField>
            <FormField id="tx-to" label={t('validTo')} error={errors.validTo} hint={t('validToHint')}>
              <Input id="tx-to" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </FormField>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {tc('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? tc('common.saving') : tc('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
