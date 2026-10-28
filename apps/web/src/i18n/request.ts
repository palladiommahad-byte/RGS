import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

type Messages = { [key: string]: string | Messages };

function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const b = out[k];
    out[k] = typeof v === 'object' && typeof b === 'object' ? deepMerge(b, v) : v;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const own = (await import(`../../messages/${locale}.json`)).default as Messages;
  // French is the fallback for keys a guest locale does not define (e.g. staff-only UI).
  const fallback =
    locale === 'fr' ? {} : ((await import('../../messages/fr.json')).default as Messages);
  return { locale, messages: deepMerge(fallback, own), timeZone: 'Africa/Casablanca' };
});
