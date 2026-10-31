export const CURRENCY = 'MAD';
export const TIMEZONE = 'Africa/Casablanca';

/** Locales for guest-facing pages. */
export const PUBLIC_LOCALES = ['en', 'fr', 'es', 'ar'] as const;
/** Locales for the staff dashboard. */
export const STAFF_LOCALES = ['fr', 'en', 'ar'] as const;
export const RTL_LOCALES = ['ar'] as const;
export type PublicLocale = (typeof PUBLIC_LOCALES)[number];
export type StaffLocale = (typeof STAFF_LOCALES)[number];

export const ROOM_STATUSES = ['FREE', 'OCCUPIED', 'CLEANING', 'OUT_OF_SERVICE'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const STAY_SOURCES = ['BOOKING', 'AIRBNB', 'EXPEDIA', 'DIRECT', 'WALK_IN', 'OTHER'] as const;
export type StaySource = (typeof STAY_SOURCES)[number];

export const STAY_STATUSES = ['PENDING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'] as const;
export type StayStatus = (typeof STAY_STATUSES)[number];

export const DOCUMENT_TYPES = ['PASSPORT', 'ID_CARD', 'OTHER'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const SEXES = ['M', 'F', 'X'] as const;
export type Sex = (typeof SEXES)[number];

export const MAX_PAGE_LIMIT = 100;

export const EXTRA_CATEGORIES = ['FOOD', 'HAMMAM', 'TRANSFER', 'EXCURSION', 'OTHER'] as const;
export type ExtraCategory = (typeof EXTRA_CATEGORIES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'OTA_COLLECTED'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** How the riad paid an expense (PETTY_CASH = from a staff cash wallet). */
export const EXPENSE_PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'CHEQUE', 'PETTY_CASH'] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export const CASH_MOVEMENT_TYPES = ['TOP_UP', 'PAYMENT', 'EXPENSE', 'ADJUSTMENT'] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export const TAX_CODES = ['TVA_ACCOMMODATION', 'TVA_FOOD', 'TAXE_SEJOUR', 'TPT'] as const;
export type TaxCode = (typeof TAX_CODES)[number];

export const TAX_MODES = ['PERCENT', 'PER_PERSON_PER_NIGHT'] as const;
export type TaxMode = (typeof TAX_MODES)[number];

/** Seeded expense categories (key is stable, names are editable). */
export const DEFAULT_EXPENSE_CATEGORIES = [
  { key: 'FOOD', nameEn: 'Food & breakfast', nameFr: 'Nourriture & petit-déjeuner', nameAr: 'الطعام والفطور', icon: 'utensils' },
  { key: 'CLEANING', nameEn: 'Cleaning & laundry', nameFr: 'Ménage & blanchisserie', nameAr: 'التنظيف والغسيل', icon: 'sparkles' },
  { key: 'UTILITIES', nameEn: 'Water, power, internet', nameFr: 'Eau, électricité, internet', nameAr: 'الماء والكهرباء والإنترنت', icon: 'plug' },
  { key: 'SALARIES', nameEn: 'Salaries', nameFr: 'Salaires', nameAr: 'الأجور', icon: 'users' },
  { key: 'MAINTENANCE', nameEn: 'Maintenance', nameFr: 'Entretien', nameAr: 'الصيانة', icon: 'wrench' },
  { key: 'OTA_COMMISSIONS', nameEn: 'OTA commissions', nameFr: 'Commissions OTA', nameAr: 'عمولات منصات الحجز', icon: 'percent' },
  { key: 'MARKETING', nameEn: 'Marketing', nameFr: 'Marketing', nameAr: 'التسويق', icon: 'megaphone' },
  { key: 'TAXES', nameEn: 'Taxes & duties', nameFr: 'Impôts & taxes', nameAr: 'الضرائب والرسوم', icon: 'landmark' },
  { key: 'SUPPLIES', nameEn: 'Supplies', nameFr: 'Fournitures', nameAr: 'المستلزمات', icon: 'package' },
  { key: 'OTHER', nameEn: 'Other', nameFr: 'Autre', nameAr: 'أخرى', icon: 'circle-ellipsis' },
] as const;

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};
