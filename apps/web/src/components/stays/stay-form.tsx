'use client';

import {
  accommodationTotal,
  addDays,
  DOCUMENT_TYPES,
  nightsBetween,
  parseMadToCentimes,
  SEXES,
  STAY_SOURCES,
  todayIso,
  type GuestDto,
  type GuestFormInput,
  type RoomDto,
  type StayDetailDto,
  type StayFormInput,
} from '@riad/shared';
import { useLocale, useTranslations } from 'next-intl';
import { NationalitySelect } from '@/components/country-select';
import { BirthDatePicker } from '@/components/birth-date-picker';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { centimesToInput, formatMoney } from '@/lib/format';
import type { FieldErrors } from '@/lib/forms';

// ---------------------------------------------------------------------------
// Stay fields
// ---------------------------------------------------------------------------

export type StayValues = {
  source: string;
  externalRef: string;
  checkInDate: string;
  checkOutDate: string;
  adults: string;
  children: string;
  pricePerNightMad: string;
  otaCommissionMad: string;
  roomId: string;
  notes: string;
};

export function emptyStayValues(): StayValues {
  const today = todayIso();
  return {
    source: 'WALK_IN',
    externalRef: '',
    checkInDate: today,
    checkOutDate: addDays(today, 1),
    adults: '2',
    children: '0',
    pricePerNightMad: '',
    otaCommissionMad: '0',
    roomId: '',
    notes: '',
  };
}

export function stayToValues(s: StayDetailDto): StayValues {
  return {
    source: s.source,
    externalRef: s.externalRef ?? '',
    checkInDate: s.checkInDate,
    checkOutDate: s.checkOutDate,
    adults: String(s.adults),
    children: String(s.children),
    pricePerNightMad: centimesToInput(s.pricePerNight),
    otaCommissionMad: centimesToInput(s.otaCommission),
    roomId: s.room?.id ?? s.requestedRoom?.id ?? '',
    notes: s.notes ?? '',
  };
}

export function stayToBody(v: StayFormInput) {
  return {
    source: v.source,
    externalRef: v.externalRef,
    checkInDate: v.checkInDate,
    checkOutDate: v.checkOutDate,
    adults: v.adults,
    children: v.children,
    pricePerNight: parseMadToCentimes(v.pricePerNightMad),
    otaCommission: parseMadToCentimes(v.otaCommissionMad),
    roomId: v.roomId,
    notes: v.notes,
  };
}

export function StayFields({
  values,
  errors,
  onChange,
  rooms,
  roomLabel,
  idPrefix = 'stay',
}: {
  values: StayValues;
  errors: FieldErrors;
  onChange: (values: StayValues) => void;
  rooms: RoomDto[];
  roomLabel: string;
  idPrefix?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const id = (k: string) => `${idPrefix}-${k}`;
  const set = (k: keyof StayValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...values, [k]: e.target.value });

  function setRoom(e: React.ChangeEvent<HTMLSelectElement>) {
    const room = rooms.find((r) => r.id === e.target.value);
    const next = { ...values, roomId: e.target.value };
    // Prefill the nightly price from the room's base price when none was typed yet.
    if (room && !values.pricePerNightMad) next.pricePerNightMad = centimesToInput(room.basePrice);
    onChange(next);
  }

  let preview: string | null = null;
  try {
    const nights = nightsBetween(values.checkInDate, values.checkOutDate);
    if (nights > 0 && values.pricePerNightMad) {
      const total = accommodationTotal(parseMadToCentimes(values.pricePerNightMad), nights);
      preview = `${t('stays.nightsCount', { count: nights })} · ${formatMoney(total, locale)}`;
    }
  } catch {
    preview = null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={id('in')} label={t('stays.checkIn')} error={errors.checkInDate}>
        <Input id={id('in')} type="date" value={values.checkInDate} onChange={set('checkInDate')} />
      </FormField>
      <FormField id={id('out')} label={t('stays.checkOut')} error={errors.checkOutDate}>
        <Input id={id('out')} type="date" value={values.checkOutDate} onChange={set('checkOutDate')} />
      </FormField>
      <FormField id={id('adults')} label={t('stays.adults')} error={errors.adults}>
        <Input id={id('adults')} type="number" inputMode="numeric" min={1} max={20} value={values.adults} onChange={set('adults')} />
      </FormField>
      <FormField id={id('children')} label={t('stays.children')} error={errors.children}>
        <Input id={id('children')} type="number" inputMode="numeric" min={0} max={20} value={values.children} onChange={set('children')} />
      </FormField>
      <FormField id={id('room')} label={roomLabel} error={errors.roomId}>
        <Select id={id('room')} value={values.roomId} onChange={setRoom}>
          <option value="">{t('stays.noRoom')}</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} — {t(`roomStatus.${r.status}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id={id('price')} label={t('stays.pricePerNight')} error={errors.pricePerNightMad} hint={preview ?? undefined}>
        <Input id={id('price')} inputMode="decimal" dir="ltr" value={values.pricePerNightMad} onChange={set('pricePerNightMad')} />
      </FormField>
      <FormField id={id('source')} label={t('stays.source')} error={errors.source}>
        <Select id={id('source')} value={values.source} onChange={set('source')}>
          {STAY_SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`source.${s}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id={id('ref')} label={t('stays.externalRef')} error={errors.externalRef}>
        <Input id={id('ref')} dir="ltr" value={values.externalRef} onChange={set('externalRef')} />
      </FormField>
      <FormField id={id('commission')} label={t('stays.otaCommission')} error={errors.otaCommissionMad}>
        <Input id={id('commission')} inputMode="decimal" dir="ltr" value={values.otaCommissionMad} onChange={set('otaCommissionMad')} />
      </FormField>
      <FormField id={id('notes')} label={t('stays.notes')} error={errors.notes} className="sm:col-span-2">
        <Textarea id={id('notes')} value={values.notes} onChange={set('notes')} />
      </FormField>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guest fields
// ---------------------------------------------------------------------------

export type GuestValues = {
  firstName: string;
  lastName: string;
  sex: string;
  nationality: string;
  birthDate: string;
  documentType: string;
  documentNumber: string;
  documentExpiry: string;
  phone: string;
  email: string;
};

export const EMPTY_GUEST: GuestValues = {
  firstName: '',
  lastName: '',
  sex: '',
  nationality: '',
  birthDate: '',
  documentType: 'PASSPORT',
  documentNumber: '',
  documentExpiry: '',
  phone: '',
  email: '',
};

export function guestToValues(g: GuestDto): GuestValues {
  return {
    firstName: g.firstName,
    lastName: g.lastName,
    sex: g.sex ?? '',
    nationality: g.nationality ?? '',
    birthDate: g.birthDate ?? '',
    documentType: g.documentType ?? '',
    documentNumber: g.documentNumber ?? '',
    documentExpiry: g.documentExpiry ?? '',
    phone: g.phone ?? '',
    email: g.email ?? '',
  };
}

/** Selects send "" for "not set"; the schema wants undefined. */
export function guestValuesForSchema(v: GuestValues) {
  return { ...v, sex: v.sex || undefined, documentType: v.documentType || undefined };
}

/** For PATCH: every optional field is sent, empty ones as null so they get cleared. */
export function guestToUpdateBody(g: GuestFormInput) {
  return {
    firstName: g.firstName,
    lastName: g.lastName,
    sex: g.sex ?? null,
    nationality: g.nationality ?? null,
    birthDate: g.birthDate ?? null,
    documentType: g.documentType ?? null,
    documentNumber: g.documentNumber ?? null,
    documentExpiry: g.documentExpiry ?? null,
    phone: g.phone ?? null,
    email: g.email ?? null,
  };
}

export function GuestFields({
  values,
  errors,
  onChange,
  idPrefix = 'guest',
  errorPrefix = '',
  hideContact = false,
}: {
  values: GuestValues;
  errors: FieldErrors;
  onChange: (values: GuestValues) => void;
  idPrefix?: string;
  /** e.g. "mainGuest." when the guest is nested in a larger form. */
  errorPrefix?: string;
  /** Guest self check-in collects phone and email once, on the contact step. */
  hideContact?: boolean;
}) {
  const t = useTranslations();
  const id = (k: string) => `${idPrefix}-${k}`;
  const err = (k: string) => errors[`${errorPrefix}${k}`];
  const set = (k: keyof GuestValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...values, [k]: e.target.value });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={id('first')} label={t('guest.firstName')} error={err('firstName')}>
        <Input id={id('first')} autoComplete="off" value={values.firstName} onChange={set('firstName')} aria-invalid={!!err('firstName')} />
      </FormField>
      <FormField id={id('last')} label={t('guest.lastName')} error={err('lastName')}>
        <Input id={id('last')} autoComplete="off" value={values.lastName} onChange={set('lastName')} aria-invalid={!!err('lastName')} />
      </FormField>
      <FormField id={id('nat')} label={t('guest.nationality')} error={err('nationality')}>
        <NationalitySelect
          id={id('nat')}
          value={values.nationality}
          onChange={(nationality) => onChange({ ...values, nationality })}
          invalid={!!err('nationality')}
        />
      </FormField>
      <FormField id={id('sex')} label={t('guest.sex')} error={err('sex')}>
        <Select id={id('sex')} value={values.sex} onChange={set('sex')}>
          <option value="">—</option>
          {SEXES.map((s) => (
            <option key={s} value={s}>
              {t(`sex.${s}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id={id('birth')} label={t('guest.birthDate')} error={err('birthDate')}>
        <BirthDatePicker
          id={id('birth')}
          title={t('guest.birthDate')}
          value={values.birthDate}
          onChange={(birthDate) => onChange({ ...values, birthDate })}
          invalid={!!err('birthDate')}
        />
      </FormField>
      <FormField id={id('doctype')} label={t('guest.documentType')} error={err('documentType')}>
        <Select id={id('doctype')} value={values.documentType} onChange={set('documentType')}>
          <option value="">—</option>
          {DOCUMENT_TYPES.map((d) => (
            <option key={d} value={d}>
              {t(`documentType.${d}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id={id('docnum')} label={t('guest.documentNumber')} error={err('documentNumber')}>
        <Input id={id('docnum')} dir="ltr" autoComplete="off" value={values.documentNumber} onChange={set('documentNumber')} />
      </FormField>
      <FormField id={id('docexp')} label={t('guest.documentExpiry')} error={err('documentExpiry')}>
        <Input id={id('docexp')} type="date" value={values.documentExpiry} onChange={set('documentExpiry')} />
      </FormField>
      {!hideContact && (
        <>
          <FormField id={id('phone')} label={t('guest.phone')} error={err('phone')}>
            <Input id={id('phone')} type="tel" dir="ltr" value={values.phone} onChange={set('phone')} />
          </FormField>
          <FormField id={id('email')} label={t('guest.email')} error={err('email')}>
            <Input id={id('email')} type="email" dir="ltr" value={values.email} onChange={set('email')} />
          </FormField>
        </>
      )}
    </div>
  );
}
