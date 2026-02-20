/**
 * Knex Configuration (knexfile.ts)
 *
 * Knex is a SQL query builder — think of it as a translator that lets you
 * write database queries in JavaScript/TypeScript instead of raw SQL strings.
 * This file tells Knex how to connect to PostgreSQL and where to find migration files.
 *
 * Connection settings come from the same source of truth as the app: src/core/config.ts
 * (DATABASE_URL, DB_SSL, DB_POOL_*). The config is keyed by NODE_ENV so the same
 * codebase works locally and on a server without code changes.
 *
 * Why migrations point at `.ts` files:
 *   Migrations live as TypeScript source in src/infrastructure/database/migrations/.
 *   We run Knex CLI through `tsx` so it can compile and run .ts migrations on the fly.
 *
 * Consumed by: Knex CLI (`npm run migrate`, `npm run migrate:rollback`) and seed when `--migrate` is passed.
 */

import type { Knex } from 'knex';

import { config } from './src/core/config';
import path from 'node:path';

function getConnection(): Knex.PgConnectionConfig {
  const base: Knex.PgConnectionConfig = {
    connectionString: config.database.url,
    ssl: {
      rejectUnauthorized: false,
    },
  };
  return base;
}

const knexConfig: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: getConnection(),
    pool: {
      min: config.database.pool.min,
      max: config.database.pool.max,
    },
    migrations: {
      directory: path.join(__dirname, 'src/infrastructure/database/migrations'),
      extension: 'ts',
    },
  },

  production: {
    client: 'pg',
    connection: getConnection(),
    pool: {
      min: config.database.pool.min,
      max: Math.max(config.database.pool.max, 20),
    },
    migrations: {
      directory: path.join(__dirname, 'src/infrastructure/database/migrations'),
      extension: 'ts',
    },
  },
};

export default knexConfig;
