import { isIsoDate } from '@riad/shared';
import { Transform } from 'class-transformer';
import { registerDecorator, type ValidationOptions } from 'class-validator';

/** Calendar date as "YYYY-MM-DD" (validated as a real date). */
export function IsIsoDate(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isIsoDate',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: { message: '$property must be a date formatted YYYY-MM-DD', ...options },
      validator: { validate: (v: unknown) => typeof v === 'string' && isIsoDate(v) },
    });
  };
}

/** Trims strings and turns "" into undefined, so optional text fields stay optional. */
export const TrimToUndefined = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

/** Query-string booleans ("true"/"false"). */
export const QueryBoolean = () =>
  Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' ? false : value));
