import type { ZodError } from 'zod';

export type FieldErrors = Record<string, string>;

const KNOWN = new Set([
  'invalid_date',
  'invalid_amount',
  'invalid_nationality',
  'checkout_before_checkin',
  'required',
  'invalid_cin',
  'end_before_start',
  'invalid_email',
  'invalid_prefix',
  'invalid_ice',
  'password_too_short',
  'password_mismatch',
]);

/**
 * Zod issues -> { "mainGuest.firstName": "required" }. Values are keys under
 * `validation.*` in the message files.
 */
export function fieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (out[path]) continue;
    if (KNOWN.has(issue.message)) out[path] = issue.message;
    else if (issue.code === 'too_small' && issue.type === 'string') out[path] = 'required';
    else if (issue.code === 'invalid_string' && issue.validation === 'email') out[path] = 'invalid_email';
    else out[path] = 'invalid';
  }
  return out;
}
