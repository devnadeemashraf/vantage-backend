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
