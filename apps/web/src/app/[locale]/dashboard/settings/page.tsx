'use client';

import {
  DEFAULT_CHECKOUT_TIME,
  DEFAULT_ROOM_READY_TIME,
  formatInvoiceNumber,
  INVOICE_PREFIX,
  riadSettingsFormSchema,
  type RiadSettingsDto,
} from '@riad/shared';
import { Clock, FileText, Hotel, ImageIcon, ImageUp, Landmark, QrCode, Trash2, Wifi } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { BackupsCard } from '@/components/backups-card';
import { FormError, FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Link } from '@/i18n/navigation';
import { api, apiUpload } from '@/lib/api';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction, useApiQuery } from '@/lib/use-api';

type Form = {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  invoicePrefix: string;
  ice: string;
  fiscalId: string;
  rcNumber: string;
  patente: string;
  wifiInfo: string;
  checkoutTime: string;
  roomReadyTime: string;
};
const EMPTY: Form = { name: '', address: '', city: '', phone: '', email: '', invoicePrefix: '', ice: '', fiscalId: '', rcNumber: '', patente: '', wifiInfo: '', checkoutTime: DEFAULT_CHECKOUT_TIME, roomReadyTime: DEFAULT_ROOM_READY_TIME };

/** The riad's own profile (owner only): identity on invoices, numbering, Wi-Fi, logo, stay cycle. */
export default function SettingsPage() {
  const t = useTranslations();
  const { can, refresh } = useAuth();
  const allowed = can('settings.riad');
  const query = useApiQuery<RiadSettingsDto>(allowed ? '/settings/riad' : null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  const save = useAction();
  const logo = useAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const s = query.data;

  useEffect(() => {
    if (!s) return;
    setForm({
      name: s.name,
      address: s.address ?? '',
      city: s.city ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      invoicePrefix: s.invoicePrefix,
      ice: s.ice ?? '',
      fiscalId: s.fiscalId ?? '',
      rcNumber: s.rcNumber ?? '',
      patente: s.patente ?? '',
      wifiInfo: s.wifiInfo ?? '',
      checkoutTime: s.checkoutTime,
      roomReadyTime: s.roomReadyTime,
    });
  }, [s]);

  if (!allowed) return <p className="text-muted-foreground">{t('dashboard.forbidden')}</p>;

  const set = (k: keyof Form, v: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = riadSettingsFormSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    // Optional fields go as "" so that emptying them clears them.
    const body = { ...form, name: parsed.data.name, invoicePrefix: parsed.data.invoicePrefix };
    if (await save.run(() => api<RiadSettingsDto>('/settings/riad', { method: 'PATCH', body }))) {
      setSaved(true);
      query.reload();
      await refresh();
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    if (await logo.run(() => apiUpload<RiadSettingsDto>('/settings/riad/logo', data))) {
      query.reload();
      await refresh();
    }
  }

  async function removeLogo() {
    if (!window.confirm(t('settings.logoRemoveConfirm'))) return;
    if (await logo.run(() => api('/settings/riad/logo', { method: 'DELETE' }))) {
      query.reload();
      await refresh();
    }
  }

  // "<prefix>-<year>-<seq>": keep the server's year and sequence, preview the typed prefix.
  const next = s && /-(\d{4})-(\d+)$/.exec(s.nextInvoiceNumber);
  const prefix = form.invoicePrefix.trim().toUpperCase();
  const prefixPreview = next && INVOICE_PREFIX.test(prefix) ? formatInvoiceNumber(prefix, Number(next[1]), Number(next[2])) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.settings')}
        subtitle={t('settings.subtitle')}
        actions={
          <>
            <Link href="/dashboard/rooms/qr" className={buttonVariants({ variant: 'outline' })}>
              <QrCode aria-hidden />
              {t('settings.qrCodes')}
            </Link>
            <Link href="/dashboard/taxes" className={buttonVariants({ variant: 'outline' })}>
              <Landmark aria-hidden />
              {t('nav.taxes')}
            </Link>
          </>
        }
      />

      <Section icon={ImageIcon} title={t('settings.logo')} hint={t('settings.sectionHint.logo')} className="flex flex-wrap items-center gap-5">
          <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
            {s?.logoVersion ? (
              <img src={`/api/v1/riad/logo?v=${s.logoVersion}`} alt={t('settings.logo')} className="size-full object-contain" />
            ) : (
              <Hotel className="size-9 text-muted-foreground" aria-hidden />
            )}
          </span>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t('settings.logoHint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={logo.pending}>
                <ImageUp aria-hidden />
                {s?.logoVersion ? t('settings.logoReplace') : t('settings.logoUpload')}
              </Button>
              {s?.logoVersion && (
                <Button variant="ghost" className="text-destructive" onClick={() => void removeLogo()} disabled={logo.pending}>
                  <Trash2 aria-hidden />
                  {t('common.delete')}
                </Button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t('settings.logoUpload')}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <FormError message={logo.error} />
          </div>
      </Section>

      <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
        <Section icon={Hotel} title={t('settings.identity')} hint={t('settings.sectionHint.identity')} className="grid gap-4 sm:grid-cols-2">
            <FormField id="st-name" label={t('settings.name')} error={errors.name}>
              <Input id="st-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </FormField>
            <FormField id="st-city" label={t('settings.city')} error={errors.city}>
              <Input id="st-city" value={form.city} onChange={(e) => set('city', e.target.value)} />
            </FormField>
            <FormField id="st-address" label={t('settings.address')} error={errors.address} className="sm:col-span-2">
              <Input id="st-address" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </FormField>
            <FormField id="st-phone" label={t('settings.phone')} error={errors.phone}>
              <Input id="st-phone" type="tel" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </FormField>
            <FormField id="st-email" label={t('settings.email')} error={errors.email}>
              <Input id="st-email" type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </FormField>
        </Section>

        <Section icon={FileText} title={t('settings.invoicing')} hint={t('settings.sectionHint.invoicing')} className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="st-prefix"
              label={t('settings.invoicePrefix')}
              error={errors.invoicePrefix}
              hint={prefixPreview ? t('settings.nextInvoice', { number: prefixPreview }) : t('settings.prefixRules')}
            >
              <Input id="st-prefix" dir="ltr" value={form.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase())} />
            </FormField>
            <FormField id="st-ice" label={t('settings.ice')} error={errors.ice} hint={t('settings.iceHint')}>
              <Input id="st-ice" dir="ltr" inputMode="numeric" value={form.ice} onChange={(e) => set('ice', e.target.value)} />
            </FormField>
            <FormField id="st-if" label={t('settings.fiscalId')} error={errors.fiscalId}>
              <Input id="st-if" dir="ltr" value={form.fiscalId} onChange={(e) => set('fiscalId', e.target.value)} />
            </FormField>
            <FormField id="st-rc" label={t('settings.rcNumber')} error={errors.rcNumber}>
              <Input id="st-rc" dir="ltr" value={form.rcNumber} onChange={(e) => set('rcNumber', e.target.value)} />
            </FormField>
            <FormField id="st-patente" label={t('settings.patente')} error={errors.patente}>
              <Input id="st-patente" dir="ltr" value={form.patente} onChange={(e) => set('patente', e.target.value)} />
            </FormField>
            <p className="self-end text-xs text-muted-foreground sm:col-span-2">{t('settings.invoicingHint')}</p>
        </Section>

        <Section icon={Wifi} title={t('settings.wifi')} hint={t('settings.sectionHint.wifi')}>
            <FormField id="st-wifi" label={t('settings.wifiInfo')} error={errors.wifiInfo} hint={t('settings.wifiHint')}>
              <Textarea id="st-wifi" rows={3} value={form.wifiInfo} onChange={(e) => set('wifiInfo', e.target.value)} placeholder={t('settings.wifiPlaceholder')} />
            </FormField>
        </Section>

        <Section icon={Clock} title={t('settings.stayCycle')} hint={t('settings.sectionHint.stayCycle')} className="grid gap-4 sm:grid-cols-2">
            <FormField id="st-checkout" label={t('settings.checkoutTime')} error={errors.checkoutTime} hint={t('settings.checkoutTimeHint')}>
              <Input id="st-checkout" type="time" dir="ltr" value={form.checkoutTime} onChange={(e) => set('checkoutTime', e.target.value)} />
            </FormField>
            <FormField id="st-ready" label={t('settings.roomReadyTime')} error={errors.roomReadyTime} hint={t('settings.roomReadyTimeHint')}>
              <Input id="st-ready" type="time" dir="ltr" value={form.roomReadyTime} onChange={(e) => set('roomReadyTime', e.target.value)} />
            </FormField>
            <p className="text-xs text-muted-foreground sm:col-span-2">{t('settings.stayCycleHint')}</p>
        </Section>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="submit" size="lg" disabled={save.pending || !s}>
            {save.pending ? t('common.saving') : t('common.save')}
          </Button>
          {saved && <span className="text-sm text-emerald-700">{t('settings.saved')}</span>}
          <FormError message={save.error} />
        </div>
      </form>

      <BackupsCard />
    </div>
  );
}

/** Settings block: icon, title and what it is for on the left (computers), fields on the right. */
function Section({
  icon: Icon,
  title,
  hint,
  className,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-5 rounded-2xl border bg-card p-5 shadow-xs md:p-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-10">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-900" aria-hidden>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className={className}>{children}</div>
    </section>
  );
}
