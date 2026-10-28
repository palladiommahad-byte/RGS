import { testDatabaseUrl } from './test-db';

// Must run before any app module reads the environment.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
