import { DEFAULT_EXPENSE_CATEGORIES } from './constants';
import { ROLE_NAMES, type RoleKey } from './permissions';

/** Something stored in the database with a French and an Arabic name (category, role). */
export type Named = { key?: string | null; nameFr: string; nameAr: string };

const CATEGORY_EN = new Map<string, string>(DEFAULT_EXPENSE_CATEGORIES.map((c) => [c.key, c.nameEn]));

/**
 * The database keeps French and Arabic names. In English, built-in categories and roles
 * use their English name; ones the riad created itself keep their French name.
 */
function label(item: Named, locale: string, english: string | undefined): string {
  if (locale === 'ar') return item.nameAr;
  if (locale === 'en' && english) return english;
  return item.nameFr;
}

export const categoryLabel = (c: Named, locale: string): string =>
  label(c, locale, c.key ? CATEGORY_EN.get(c.key) : undefined);

export const roleLabel = (r: Named, locale: string): string =>
  label(r, locale, r.key && r.key in ROLE_NAMES ? ROLE_NAMES[r.key as RoleKey].en : undefined);
