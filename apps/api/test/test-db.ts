/** The e2e suite runs against `<db>_test` next to the dev database, never the dev data. */
export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set (run through dotenv -e ../../.env)');
  if (process.env.DATABASE_URL_TEST) return base;
  const url = new URL(base);
  const db = url.pathname.slice(1);
  if (!db.endsWith('_test')) url.pathname = `/${db}_test`;
  return url.toString();
}
