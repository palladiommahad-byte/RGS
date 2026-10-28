const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function below100(n: number): string {
  if (n < 20) return UNITS[n]!;
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return TENS[t]!;
    return `${TENS[t]}${u === 1 ? ' et un' : `-${UNITS[u]}`}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${UNITS[n - 60]}`;
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${UNITS[n - 80]}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return below100(rest);
  const hundreds = h === 1 ? 'cent' : `${UNITS[h]} cent${rest === 0 ? 's' : ''}`;
  return rest === 0 ? hundreds : `${hundreds} ${below100(rest)}`;
}

/** Integer in French words ("deux mille trois cent quarante et un"). */
export function integerToFrench(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Unsupported number: ${n}`);
  if (n === 0) return 'zéro';
  const parts: string[] = [];
  const groups: [number, string, string][] = [
    [1_000_000_000, 'milliard', 'milliards'],
    [1_000_000, 'million', 'millions'],
  ];
  let rest = n;
  for (const [size, one, many] of groups) {
    const q = Math.floor(rest / size);
    if (q > 0) parts.push(`${below1000(q)} ${q > 1 ? many : one}`);
    rest %= size;
  }
  const thousands = Math.floor(rest / 1000);
  // "mille" never takes "un" and never takes an "s"; "cents"/"vingts" lose their s before it.
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mille' : `${below1000(thousands).replace(/(cent|vingt)s$/, '$1')} mille`);
  }
  rest %= 1000;
  if (rest > 0) parts.push(below1000(rest));
  return parts.join(' ');
}

/** 123450 centimes -> "mille deux cent trente-quatre dirhams et cinquante centimes". */
export function madInWords(centimes: number): string {
  const dirhams = Math.floor(centimes / 100);
  const cts = centimes % 100;
  const main = `${integerToFrench(dirhams)} dirham${dirhams > 1 ? 's' : ''}`;
  return cts ? `${main} et ${integerToFrench(cts)} centime${cts > 1 ? 's' : ''}` : main;
}
