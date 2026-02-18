/**
 * Application Configuration — Single Source of Truth
 * Layer: Core
 *
 * Every setting the app needs (port, DB credentials, batch sizes, etc.) flows
 * through this one file. Think of it as the reception desk of a hotel:
 * you check in here once, your details are validated, and then every floor
 * (module) can look you up from the same registry.
 *
 * How it works:
 *   1. `dotenv/config` loads the .env file into process.env.
 *   2. A Zod schema acts as a gatekeeper — it validates every env var at
 *      startup and coerces strings to the correct types (e.g. "5432" -> 5432).
 *      If anything is missing or invalid, the app crashes immediately with a
 *      clear error instead of failing mysteriously later at runtime.
 *   3. The validated values are reshaped into a clean, nested `config` object
 *      exported with `as const` so TypeScript treats every value as a literal
 *      type — no accidental mutation and full autocompletion everywhere.
 *
 * Why Zod for env validation?
 *   - Zod gives us runtime type-checking (TypeScript types disappear at runtime).
 *   - `.default()` provides sensible fallbacks for local dev.
 *   - `.coerce` converts strings (which process.env always provides) to numbers.
 */
import 'dotenv/config';
import { z } from 'zod/v4';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('vantage'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),

  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(10),

  WEB_CONCURRENCY: z.coerce.number().default(0),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  ETL_BATCH_SIZE: z.coerce.number().default(5000),
  ETL_DATA_DIR: z.string().default('./temp'),
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
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
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
} as const;

export type AppConfig = typeof config;
