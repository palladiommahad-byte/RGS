'use client';

import { addDays, todayIso } from '@riad/shared';
import { getCountryCallingCode, getExampleNumber, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import examples from 'libphonenumber-js/examples.mobile.json';
import { Minus, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { dialOptions } from '@/lib/countries';
import type { FieldErrors } from '@/lib/forms';

export type ContactValues = {
  country: CountryCode;
  phone: string;
  email: string;
  adults: number;
  children: number;
  checkOutDate: string;
};

/**
 * E.164 number if valid, else null. The guest types the local number (0612345678); the
 * country code comes from the chosen country. A number typed with its code anyway
 * (+212…, 00212…, 212…) is accepted too.
 */
export function toE164(v: ContactValues): string | null {
  const parsed = parsePhoneNumberFromString(v.phone, v.country);
  if (parsed?.isValid()) return parsed.number;
  const digits = v.phone.replace(/\D/g, '').replace(/^00/, '');
  const dial = getCountryCallingCode(v.country);
  if (digits.startsWith(dial)) {
    const withCode = parsePhoneNumberFromString(`+${digits}`);
    if (withCode?.isValid()) return withCode.number;
  }
  return null;
}

export function ContactStep({
  values,
  onChange,
  onNext,
  onBack,
}: {
  values: ContactValues;
  onChange: (values: ContactValues) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('checkin.contact');
  const tc = useTranslations('common');
  const locale = useLocale();
  const options = useMemo(() => dialOptions(locale), [locale]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const tomorrow = addDays(todayIso(), 1);
  const dial = getCountryCallingCode(values.country);
  const example = getExampleNumber(values.country, examples)?.formatNational().replace(/[\s-]/g, '') ?? '';

  // Typed with "+" and a code: switch the country to match and keep the local number.
  function setPhone(phone: string) {
    if (/^\s*(\+|00)/.test(phone)) {
      const parsed = parsePhoneNumberFromString(phone.trim().replace(/^00/, '+'));
      if (parsed?.isValid() && parsed.country) {
        return onChange({ ...values, country: parsed.country, phone: parsed.formatNational().replace(/[\s-]/g, '') });
      }
    }
    onChange({ ...values, phone });
  }

  function next() {
    const errs: FieldErrors = {};
    if (!toE164(values)) errs.phone = 'invalid_phone';
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errs.email = 'invalid_email';
    if (!values.checkOutDate || values.checkOutDate < tomorrow) errs.checkOutDate = 'departure_after_today';
    setErrors(errs);
    if (Object.keys(errs).length === 0) onNext();
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xl font-semibold">{t('title')}</h2>

      <FormField id="phone" label={t('phone')} error={errors.phone}>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2" dir="ltr">
          <Select
            aria-label={t('country')}
            value={values.country}
            onChange={(e) => onChange({ ...values, country: e.target.value as CountryCode })}
          >
            {options.map((o) => (
              <option key={o.country} value={o.country}>
                {o.name}
              </option>
            ))}
          </Select>
          {/* The country code is shown, not typed: the guest enters the local number. */}
          <div className="relative">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 font-medium text-muted-foreground" aria-hidden>
              +{dial}
            </span>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={example}
              style={{ paddingInlineStart: `calc(${dial.length + 1}ch + 1.25rem)` }}
              value={values.phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={!!errors.phone}
            />
          </div>
        </div>
      </FormField>

      <FormField id="email" label={t('email')} error={errors.email} hint={t('emailHint')}>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          value={values.email}
          onChange={(e) => onChange({ ...values, email: e.target.value })}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <Counter label={t('adults')} value={values.adults} min={1} onChange={(adults) => onChange({ ...values, adults })} />
        <Counter label={t('children')} value={values.children} min={0} onChange={(children) => onChange({ ...values, children })} />
      </div>

      <FormField id="departure" label={t('departure')} error={errors.checkOutDate}>
        <Input
          id="departure"
          type="date"
          min={tomorrow}
          value={values.checkOutDate}
          onChange={(e) => onChange({ ...values, checkOutDate: e.target.value })}
        />
      </FormField>

      <div className="flex gap-3">
        <Button variant="outline" size="lg" className="flex-1" onClick={onBack}>
          {tc('back')}
        </Button>
        <Button size="lg" className="flex-[2]" onClick={next}>
          {tc('next')}
        </Button>
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="icon" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label} −`}>
          <Minus />
        </Button>
        <span className="text-2xl font-semibold tabular-nums" aria-live="polite">
          {value}
        </span>
        <Button type="button" variant="outline" size="icon" onClick={() => onChange(Math.min(20, value + 1))} aria-label={`${label} +`}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}
