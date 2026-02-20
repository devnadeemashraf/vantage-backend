/**
 * Database Connection Pool — Singleton
 * Layer: Infrastructure
 * Pattern: Singleton
 *
 * I use a single Knex pool per process so we reuse connections instead of
 * opening one per query (TCP + auth would add up). Each process (e.g. each
 * cluster worker) gets its own pool because they can’t share sockets across
 * OS processes. Pool min/max come from config; destroyDbConnection() is
 * called on SIGTERM so we close connections cleanly before exit.
 */
import { config } from '@core/config';
import { logger } from '@core/logger';
import knex, { Knex } from 'knex';

let instance: Knex | null = null;
export function getDbConnection(): Knex {
  if (!instance) {
    instance = knex({
      client: 'pg',
      connection: {
        connectionString: config.database.url,
        ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      },
      pool: {
        min: config.database.pool.min,
        max: config.database.pool.max,
        afterCreate: (conn: unknown, done: (err: Error | null, conn: unknown) => void) => {
          logger.debug('New database connection established');
          done(null, conn);
        },
      },
      acquireConnectionTimeout: 10000,
    });

    logger.info({ ssl: config.database.ssl }, 'Database connection pool initialized');
  }

  return instance;
}

/** Tear down the pool (SIGTERM or test teardown). */
export async function destroyDbConnection(): Promise<void> {
  if (instance) {
    await instance.destroy();
    instance = null;
    logger.info('Database connection pool destroyed');
  }
}
