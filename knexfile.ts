/**
 * Knex Configuration (knexfile.ts)
 *
 * Knex is a SQL query builder — think of it as a translator that lets you
 * write database queries in JavaScript/TypeScript instead of raw SQL strings.
 * This file tells Knex how to connect to PostgreSQL and where to find migration files.
 *
 * The config is keyed by NODE_ENV (development / production) so the same
 * codebase works locally and on a server without code changes — only the
 * environment variables differ.
 *
 * Why migrations point at `.ts` files:
 *   Migrations live as TypeScript source in src/infrastructure/database/migrations/.
 *   We run Knex CLI through `tsx` (a TypeScript executor) so it can compile
 *   and run .ts migrations on the fly — no separate build step needed.
 *
 * This file is consumed in two ways:
 *   1. By the Knex CLI (`npm run migrate`) to run migration commands.
 *   2. By the seed script when `--migrate` flag is passed.
 */
import 'dotenv/config';
import type { Knex } from 'knex';

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'vantage',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    },
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    },
    migrations: {
      directory: './src/infrastructure/database/migrations',
      extension: 'ts',
    },
  },

  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
    },
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    },
    migrations: {
      directory: './src/infrastructure/database/migrations',
      extension: 'ts',
    },
  },
};

export default config;
