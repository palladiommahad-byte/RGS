/**
 * Money is always an integer number of centimes (1 MAD = 100 centimes). Never floats.
 */
export type Centimes = number;

// Whitespace plus no-break (0xa0) and narrow no-break (0x202f) spaces, which Intl uses in fr-MA.
const SPACES = new RegExp(`[\\s${String.fromCharCode(0xa0, 0x202f)}]`, 'g');

/** Parses "1 234,50", "1234.5", "1234" into centimes without floating-point math. */
export function parseMadToCentimes(input: string | number): Centimes {
  const raw = typeof input === 'number' ? input.toString() : input;
  const cleaned = raw.replace(SPACES, '').replace(',', '.');
  const match = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) throw new Error(`Invalid amount: "${raw}"`);
  const [, sign, whole, frac = ''] = match;
  const centimes = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(centimes)) throw new Error(`Amount out of range: "${raw}"`);
  return sign ? -centimes : centimes;
}

export function assertCentimes(value: number): Centimes {
  if (!Number.isSafeInteger(value)) throw new Error(`Not an integer centime amount: ${value}`);
  return value;
}

/** Formats centimes as a MAD string for display, e.g. 123450 -> "1 234,50 MAD" (fr). */
export function formatMad(centimes: Centimes, locale = 'fr-MA'): string {
  assertCentimes(centimes);
  const amount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centimes / 100);
  return `${amount} MAD`;
}

/**
 * Percentage of an amount, rounded half away from zero to the nearest centime.
 * `basisPoints`: 10% = 1000.
 */
export function percentOf(centimes: Centimes, basisPoints: number): Centimes {
  assertCentimes(centimes);
  assertCentimes(basisPoints);
  const product = centimes * basisPoints;
  const sign = product < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(product) / 10000);
}
