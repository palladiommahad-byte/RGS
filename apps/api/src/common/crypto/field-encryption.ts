import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * Application-level encryption for sensitive identifiers (passport number, CIN).
 * Format: "v1:<iv b64>:<auth tag b64>:<ciphertext b64>" using AES-256-GCM.
 */
export class FieldEncryption {
  private static readonly VERSION = 'v1';
  private readonly key: Buffer;

  constructor(
    base64Key: string,
    private readonly hashKey: string,
  ) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) {
      throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes encoded as base64');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [FieldEncryption.VERSION, iv, tag, ciphertext]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
      .join(':');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split(':');
    if (version !== FieldEncryption.VERSION || !iv || !tag || !ciphertext) {
      throw new Error('Unsupported encrypted payload');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Deterministic blind index for exact-match search on encrypted values. */
  hash(value: string): string {
    const normalised = value.replace(/[\s-]/g, '').toUpperCase();
    return createHmac('sha256', this.hashKey).update(normalised).digest('hex');
  }

  encryptNullable(value: string | null | undefined): { cipher: string | null; hash: string | null } {
    if (!value) return { cipher: null, hash: null };
    return { cipher: this.encrypt(value), hash: this.hash(value) };
  }
}
