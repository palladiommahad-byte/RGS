import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { testDatabaseUrl } from './test-db';

/** Creates the test database if needed and applies all migrations to it. */
export default async function globalSetup(): Promise<void> {
  const testUrl = testDatabaseUrl();
  const dbName = new URL(testUrl).pathname.slice(1);
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } catch (e) {
    if (!String(e).includes('already exists')) throw e;
  } finally {
    await admin.$disconnect();
  }
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}
