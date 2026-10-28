import { formatMad, TIMEZONE, type Centimes, type IsoDate } from '@riad/shared';

/** Moroccan regional variants; ar-MA keeps Latin digits, which staff expect. */
export function intlLocale(locale: string): string {
  if (locale === 'ar') return 'ar-MA';
  if (locale === 'fr') return 'fr-MA';
  return locale;
}

/** Calendar dates are UTC midnight, so format them in UTC to never shift a day. */
export function formatDate(
  iso: IsoDate,
  locale: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

export function formatDateTime(timestamp: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TIMEZONE,
  }).format(new Date(timestamp));
}

/** "il y a 5 min", "منذ ساعتين"… */
export function timeAgo(timestamp: string, locale: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(timestamp).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

export function formatMoney(centimes: Centimes, locale: string): string {
  return formatMad(centimes, intlLocale(locale));
}

/** Centimes -> "950.50" for prefilling an amount input (integer math only). */
export function centimesToInput(centimes: Centimes): string {
  const sign = centimes < 0 ? '-' : '';
  const abs = Math.abs(centimes);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
