import { randomBytes } from 'node:crypto';
import { FieldEncryption } from './field-encryption';

describe('FieldEncryption', () => {
  const enc = new FieldEncryption(randomBytes(32).toString('base64'), 'test-hash-key-123456');

  it('round-trips a value', () => {
    const cipher = enc.encrypt('AB1234567');
    expect(cipher).not.toContain('AB1234567');
    expect(enc.decrypt(cipher)).toBe('AB1234567');
  });

  it('uses a random IV (same input -> different ciphertext)', () => {
    expect(enc.encrypt('X')).not.toBe(enc.encrypt('X'));
  });

  it('detects tampering', () => {
    const [v, iv, tag, ct] = enc.encrypt('AB1234567').split(':');
    const flipped = Buffer.from(ct!, 'base64');
    flipped[0] = flipped[0]! ^ 1;
    expect(() => enc.decrypt([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
  });

  it('hashes deterministically and ignores spacing/case', () => {
    expect(enc.hash('ab 123-456')).toBe(enc.hash('AB123456'));
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => new FieldEncryption(randomBytes(16).toString('base64'), 'k')).toThrow();
  });
});
