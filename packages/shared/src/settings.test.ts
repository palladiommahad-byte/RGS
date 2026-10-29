import { describe, expect, it } from 'vitest';
import { changePasswordSchema, riadSettingsFormSchema } from './schemas/settings';

describe('riad settings form', () => {
  const base = { name: 'Riad Demo', invoicePrefix: 'rd-26' };

  it('uppercases the invoice prefix and drops empty fields', () => {
    const r = riadSettingsFormSchema.parse({ ...base, ice: '', wifiInfo: '  ' });
    expect(r).toMatchObject({ invoicePrefix: 'RD-26', ice: undefined, wifiInfo: undefined });
  });

  it('checks the ICE (15 digits) and the prefix characters', () => {
    expect(riadSettingsFormSchema.safeParse({ ...base, ice: '001234567000089' }).success).toBe(true);
    expect(riadSettingsFormSchema.safeParse({ ...base, ice: '12345' }).success).toBe(false);
    expect(riadSettingsFormSchema.safeParse({ ...base, invoicePrefix: 'FAC/26' }).success).toBe(false);
  });
});

describe('change password form', () => {
  it('requires 8 characters and a matching confirmation', () => {
    expect(changePasswordSchema.safeParse({ current: 'x', next: 'short', confirm: 'short' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ current: 'x', next: 'long enough', confirm: 'long enougH' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ current: 'x', next: 'long enough', confirm: 'long enough' }).success).toBe(true);
  });
});
