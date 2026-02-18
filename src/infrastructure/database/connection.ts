import knex, { Knex } from 'knex';
import { config } from '@core/config';
import { logger } from '@core/logger';

let instance: Knex | null = null;

/**
 * Returns a singleton Knex instance backed by a pg connection pool.
 * The pool is configured per-process -- in a clustered setup each
 * worker gets its own pool (which is correct; pools are not shareable
 * across processes).
 */
export function getDbConnection(): Knex {
  if (!instance) {
    instance = knex({
      client: 'pg',
      connection: {
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        user: config.database.user,
        password: config.database.password,
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

    logger.info(
      { host: config.database.host, database: config.database.name },
      'Database connection pool initialized',
    );
  }

  return instance;
}

/** Gracefully tears down the pool (used on SIGTERM / test cleanup). */
export async function destroyDbConnection(): Promise<void> {
  if (instance) {
    await instance.destroy();
    instance = null;
    logger.info('Database connection pool destroyed');
  }
}
