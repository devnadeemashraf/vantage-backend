/**
 * Application Configuration — Single Source of Truth
 * Layer: Core
 *
 * I funnel all app settings (port, DB credentials, batch sizes, etc.) through
 * this file so there’s one place to look and one place to validate. Every other
 * module imports `config` instead of reading process.env directly.
 *
 * Flow: dotenv loads .env into process.env; a Zod schema validates and coerces
 * (e.g. "5432" → 5432) at startup. If anything is missing or invalid, the app
 * exits immediately with a clear error — I prefer fail-fast over mysterious
 * runtime failures. The result is a nested `config` object exported with
 * `as const` for literal types and no accidental mutation.
 *
 * I use Zod for env validation because TypeScript types are erased at runtime;
 * Zod gives real runtime checks. `.default()` and `.coerce` handle local dev
 * and string-to-number conversion without extra code.
 */
import 'dotenv/config';

import { z } from 'zod/v4';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** Full PostgreSQL connection URL (e.g. postgres://user:password@host:5432/dbname). */
  DATABASE_URL: z.string().min(1).default('postgres://postgres:@localhost:5432/vantage'),
  /** Enable SSL for the database connection (e.g. required by managed Postgres). Default false. */
  DB_SSL: z.coerce.boolean().default(false),

  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(10),

  WEB_CONCURRENCY: z.coerce.number().default(0),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  ETL_BATCH_SIZE: z.coerce.number().default(5000),
  ETL_DATA_DIR: z.string().default('./temp'),

  /** Max candidate IDs considered for search (caps work for stable latency; also max paginatable total). */
  SEARCH_MAX_CANDIDATES: z.coerce.number().min(100).max(50_000).default(5000),
  /** Terms this length or shorter use prefix-only (ILIKE term%) for bounded, fast response. */
  SEARCH_SHORT_QUERY_MAX_LENGTH: z.coerce.number().min(1).max(5).default(2),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', z.treeifyError(parsed.error));
  process.exit(1);
}

const env = parsed.data;

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',

  database: {
    url: env.DATABASE_URL,
    ssl: (env.DB_SSL = false),
    pool: {
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX,
    },
  },

  cluster: {
    workers: env.WEB_CONCURRENCY,
  },

  log: {
    level: env.LOG_LEVEL,
  },

  etl: {
    batchSize: env.ETL_BATCH_SIZE,
    dataDir: env.ETL_DATA_DIR,
  },

  /** Search performance: candidate cap and short-query behaviour (see PostgresBusinessRepository). */
  search: {
    maxCandidates: env.SEARCH_MAX_CANDIDATES,
    shortQueryMaxLength: env.SEARCH_SHORT_QUERY_MAX_LENGTH,
  },
} as const;

export type AppConfig = typeof config;
