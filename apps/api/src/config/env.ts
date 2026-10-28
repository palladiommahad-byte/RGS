import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.string().default('loopback'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  FIELD_ENCRYPTION_KEY: z.string().min(1),
  FIELD_HASH_KEY: z.string().min(16),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET_PASSPORTS: z.string().default('riad-passports'),
  S3_BUCKET_RECEIPTS: z.string().default('riad-receipts'),
  S3_BUCKET_DOCUMENTS: z.string().default('riad-documents'),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  /** When set, passport OCR uses Google Vision instead of the local Tesseract engine. */
  GOOGLE_VISION_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  OCR_CACHE_DIR: z.string().default('.cache/tesseract'),
  PASSPORT_IMAGE_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
      throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
    }
    cached = parsed.data;
  }
  return cached;
}
