import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';

/**
 * The TypeORM CLI executes workspace scripts with apps/api as the current
 * directory. Load the monorepo root .env when variables were not already
 * provided by Docker, the shell or the host environment.
 */
const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(__dirname, '../../../../.env'),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required. Define it in the monorepo root .env or in the process environment.',
  );
}

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ALL_ENTITIES,
  migrations: [resolve(__dirname, '../../database/migrations/*.{ts,js}')],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// TypeORM CLI requires the data-source file to expose exactly one DataSource.
export default AppDataSource;
