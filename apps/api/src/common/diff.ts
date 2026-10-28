import type { Prisma } from '@prisma/client';

type Plain = string | number | boolean | null;

function normalise(v: unknown): Plain {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined) return null;
  return v as Plain;
}

/** `{ field: [before, after] }` for the listed keys that changed — stored in the audit log. */
export function diffFields<T extends object>(
  before: T,
  after: Partial<T>,
  keys: readonly (keyof T)[],
): Prisma.InputJsonObject {
  const out: Record<string, Plain[]> = {};
  for (const k of keys) {
    if (!(k in after)) continue;
    const a = normalise(before[k]);
    const b = normalise(after[k]);
    if (a !== b) out[String(k)] = [a, b];
  }
  return out;
}
