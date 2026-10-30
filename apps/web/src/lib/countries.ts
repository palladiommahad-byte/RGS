import countries from 'i18n-iso-countries';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import { intlLocale } from './format';

export type CountryOption = { code: string; name: string };

const ALPHA3_TO_ALPHA2 = countries.getAlpha3Codes();

export function alpha3ToAlpha2(alpha3: string | undefined | null): string | undefined {
  return alpha3 ? ALPHA3_TO_ALPHA2[alpha3.toUpperCase()] : undefined;
}

function displayNames(locale: string): (alpha2: string) => string | undefined {
  try {
    const names = new Intl.DisplayNames([intlLocale(locale)], { type: 'region' });
    return (code) => {
      try {
        return names.of(code);
      } catch {
        return undefined;
      }
    };
  } catch {
    return () => undefined;
  }
}

const cache = new Map<string, CountryOption[]>();

/** Nationalities as ISO alpha-3 (what passports print), named in the UI language. */
export function nationalityOptions(locale: string): CountryOption[] {
  const key = `nat:${locale}`;
  if (!cache.has(key)) {
    const name = displayNames(locale);
    const list = Object.entries(ALPHA3_TO_ALPHA2)
      .map(([a3, a2]) => ({ code: a3, name: name(a2) ?? a3 }))
      .sort((a, b) => a.name.localeCompare(b.name, intlLocale(locale)));
    cache.set(key, list);
  }
  return cache.get(key)!;
}

export type DialOption = { country: CountryCode; dial: string; name: string };

/** Phone country picker: "Maroc (+212)". */
export function dialOptions(locale: string): DialOption[] {
  const key = `dial:${locale}`;
  if (!cache.has(key)) {
    const name = displayNames(locale);
    const list = getCountries()
      .map((c) => ({ code: c, name: `${name(c) ?? c} (+${getCountryCallingCode(c)})` }))
      .sort((a, b) => a.name.localeCompare(b.name, intlLocale(locale)));
    cache.set(key, list);
  }
  return cache.get(key)!.map((o) => ({ country: o.code as CountryCode, dial: getCountryCallingCode(o.code as CountryCode), name: o.name }));
}

/** "MAR" -> "Maroc" in the UI language (falls back to the code). */
export function nationalityName(alpha3: string | null | undefined, locale: string): string | null {
  if (!alpha3) return null;
  const a2 = alpha3ToAlpha2(alpha3);
  return (a2 && displayNames(locale)(a2)) || alpha3;
}
