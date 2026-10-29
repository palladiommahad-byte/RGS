import { formatMad, TIMEZONE, zonedMidnight, type Centimes, type IsoDate } from '@riad/shared';

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

/** "08:02" in the riad's timezone. */
export function formatTime(timestamp: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TIMEZONE }).format(
    new Date(timestamp),
  );
}

/** 485 -> "8 h 05" */
export function formatMinutes(minutes: number): string {
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** Instant -> `datetime-local` value in the riad's timezone (whatever the browser's zone). */
export function toRiadInput(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(timestamp));
  const p = (type: string) => parts.find((x) => x.type === type)?.value ?? '00';
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
}

/** `datetime-local` value read as riad time -> ISO instant. */
export function fromRiadInput(value: string): string {
  const [date, time = '00:00'] = value.split('T');
  const [h, m] = time.split(':').map(Number);
  return new Date(zonedMidnight(date!).getTime() + (h! * 60 + m!) * 60_000).toISOString();
}
