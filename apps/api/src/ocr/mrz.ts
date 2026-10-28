import { isIsoDate, type DocumentType, type IsoDate, type Sex } from '@riad/shared';
import { parse } from 'mrz';

/** Fields read from a passport / ID card machine-readable zone, ready for the guest form. */
export type MrzFields = {
  firstName?: string;
  lastName?: string;
  sex?: Sex;
  nationality?: string;
  birthDate?: IsoDate;
  documentType: DocumentType;
  documentNumber?: string;
  documentExpiry?: IsoDate;
};

export type MrzResult = {
  /** All check digits matched. When false the guest must double-check every field. */
  valid: boolean;
  format: string;
  raw: string;
  fields: MrzFields;
};

// ICAO 9303 layouts: passport (TD3), ID cards (TD1), older IDs and visas (TD2).
const FORMATS = [
  { lines: 2, length: 44 },
  { lines: 3, length: 30 },
  { lines: 2, length: 36 },
] as const;

/** ICAO codes that are not ISO 3166 alpha-3 (Germany prints "D"). */
const STATE_ALIASES: Record<string, string> = { D: 'DEU' };

export function normaliseOcrLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/[«‹]/g, '<')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9<]/g, '');
}

const fit = (l: string, length: number) => l.slice(0, length).padEnd(length, '<');

/**
 * Tesseract often reads the "<" filler as K or L and collapses long filler runs.
 * Names: a run that starts with "<" and contains another "<" is a separator ("<<");
 * a trailing run of 4+ K/L letters is filler.
 */
export function repairNameLine(line: string): string {
  return line
    .replace(/<[KL<]*<(?=[A-Z])/g, '<<')
    .replace(/<[KL<]*$/, (m) => '<'.repeat(m.length))
    .replace(/[KL]{4,}<*$/, (m) => '<'.repeat(m.length));
}

/**
 * TD3 line 2 has a fixed layout: 28 data characters, a 14-character personal number
 * plus its check digit (usually all filler), then the composite check digit. Rebuilds
 * the filler block so the final digit lands at position 44.
 */
export function repairTd3DataLine(line: string): string {
  const head = line.slice(0, 28);
  const tail = line.slice(28);
  const last = /\d$/.test(tail) ? tail.slice(-1) : '<';
  const middle = (last === '<' ? tail : tail.slice(0, -1)).replace(/[KL]/g, '<');
  return fit(head, 28) + fit(middle, 15) + last;
}

/** Candidate MRZ blocks found in free OCR text, each fitted to its format's exact width. */
export function findMrzCandidates(text: string): string[][] {
  const lines = text.split(/\r?\n/).map(normaliseOcrLine).filter((l) => l.length >= 25);
  const candidates: string[][] = [];
  for (const f of FORMATS) {
    for (let i = 0; i + f.lines <= lines.length; i++) {
      const group = lines.slice(i, i + f.lines);
      const fits = group.every((l) => Math.abs(l.length - f.length) <= 12);
      if (!fits || !group.join('').includes('<')) continue;
      // Repaired variants go first: names carry no check digit, so on equal scores the
      // earlier candidate wins and the repaired names are the better guess.
      if (f.length === 44) {
        // Also line 2 with one stray character removed (an extra "O" read inside the
        // document number shifts every following field).
        const names = fit(repairNameLine(group[0]!), 44);
        const data = group[1]!;
        candidates.push([names, repairTd3DataLine(data)]);
        candidates.push(group.map((l) => fit(l, f.length)));
        for (let d = 0; d < 12 && d < data.length; d++) {
          candidates.push([names, repairTd3DataLine(data.slice(0, d) + data.slice(d + 1))]);
        }
      } else if (f.length === 30) {
        candidates.push([fit(group[0]!, 30), fit(group[1]!, 30), fit(repairNameLine(group[2]!), 30)]);
        candidates.push(group.map((l) => fit(l, f.length)));
      } else {
        candidates.push(group.map((l) => fit(l, f.length)));
      }
    }
  }
  return candidates;
}

/** Best MRZ found in the OCR text (fully valid first, else the most valid fields), or null. */
export function parseMrzText(text: string, today: Date = new Date()): MrzResult | null {
  let best: { result: ReturnType<typeof parse>; lines: string[]; score: number } | null = null;
  for (const lines of findMrzCandidates(text)) {
    let result: ReturnType<typeof parse>;
    try {
      result = parse(lines, { autocorrect: true });
    } catch {
      continue;
    }
    const score = result.details.filter((d) => d.valid).length;
    if (!best || score > best.score) best = { result, lines, score };
    if (result.valid) break;
  }
  if (!best) return null;
  return {
    valid: best.result.valid,
    format: best.result.format,
    raw: best.lines.join('\n'),
    fields: toFields(best.result, best.lines, today),
  };
}

function toFields(result: ReturnType<typeof parse>, lines: string[], today: Date): MrzFields {
  // mrz returns null for values it rejects (e.g. an unknown state code); fall back to raw text.
  const value = (field: string): string | undefined => {
    const parsed = (result.fields as Record<string, string | null | undefined>)[field];
    if (parsed) return parsed;
    const d = result.details.find((x) => x.field === field);
    const raw = d ? lines[d.line]?.slice(d.start, d.end) : undefined;
    const cleaned = raw?.replace(/</g, '').trim();
    return cleaned ? cleaned : undefined;
  };
  const code = value('documentCode') ?? '';
  return {
    firstName: titleCase(value('firstName')),
    lastName: titleCase(value('lastName')),
    sex: toSex(value('sex')),
    nationality: toStateCode(value('nationality')),
    birthDate: yymmddToIso(value('birthDate'), 'past', today),
    documentType: code.startsWith('P') ? 'PASSPORT' : /^[IAC]/.test(code) ? 'ID_CARD' : 'OTHER',
    documentNumber: value('documentNumber'),
    documentExpiry: yymmddToIso(value('expirationDate'), 'future', today),
  };
}

function titleCase(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v
    .toLowerCase()
    .split(/([ -])/)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join('');
}

function toSex(v: string | undefined): Sex | undefined {
  if (v === 'male' || v === 'M') return 'M';
  if (v === 'female' || v === 'F') return 'F';
  if (v === 'nonspecified' || v === 'X') return 'X';
  return undefined;
}

function toStateCode(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const code = STATE_ALIASES[v] ?? v;
  return /^[A-Z]{3}$/.test(code) ? code : undefined;
}

/**
 * MRZ dates have a two-digit year. Birth dates are in the past (a "future" year means
 * the 1900s); expiry dates are assumed to be in this century.
 */
export function yymmddToIso(
  v: string | undefined,
  kind: 'past' | 'future',
  today: Date = new Date(),
): IsoDate | undefined {
  if (!v || !/^\d{6}$/.test(v)) return undefined;
  const yy = Number(v.slice(0, 2));
  const currentYy = today.getUTCFullYear() % 100;
  const century = kind === 'past' ? (yy > currentYy ? 1900 : 2000) : 2000;
  const iso = `${century + yy}-${v.slice(2, 4)}-${v.slice(4, 6)}`;
  return isIsoDate(iso) ? iso : undefined;
}
