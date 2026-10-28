'use client';

import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { Select } from '@/components/ui/select';
import { nationalityOptions } from '@/lib/countries';

/** Nationality picker; the value is the ISO alpha-3 code printed in passports. */
export function NationalitySelect({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (alpha3: string) => void;
  invalid?: boolean;
}) {
  const locale = useLocale();
  const options = useMemo(() => nationalityOptions(locale), [locale]);
  const known = !value || options.some((o) => o.code === value);

  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid}>
      <option value="">—</option>
      {/* Codes outside ISO 3166 (e.g. refugee travel documents) stay selectable. */}
      {!known && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.name}
        </option>
      ))}
    </Select>
  );
}
