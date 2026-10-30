import { describe, expect, it } from 'vitest';
import { categoryLabel, roleLabel } from './names';

describe('database names in the UI language', () => {
  const food = { key: 'FOOD', nameFr: 'Nourriture & petit-déjeuner', nameAr: 'الطعام والفطور' };
  const custom = { key: null, nameFr: 'Jardin', nameAr: 'الحديقة' };

  it('uses the built-in English name, French for custom entries, Arabic in Arabic', () => {
    expect(categoryLabel(food, 'en')).toBe('Food & breakfast');
    expect(categoryLabel(custom, 'en')).toBe('Jardin');
    expect(categoryLabel(food, 'ar')).toBe('الطعام والفطور');
    expect(categoryLabel(food, 'fr')).toBe('Nourriture & petit-déjeuner');
    expect(roleLabel({ key: 'MANAGER', nameFr: 'Gérant', nameAr: 'المدير' }, 'en')).toBe('Manager');
  });
});
