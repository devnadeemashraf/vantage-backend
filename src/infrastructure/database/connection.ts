/**
 * Database Connection Pool — Singleton
 * Layer: Infrastructure
 * Pattern: Singleton
 *
 * A connection pool is like a **valet parking service** for database connections.
 * Instead of opening a new connection for every query (slow — TCP handshake,
 * authentication, etc.), the pool keeps a set of pre-opened connections ready
 * to go. When a query needs one, it borrows from the pool; when done, it
 * returns it. This is why even millions of queries only use 2-10 connections.
 *
 * The Singleton pattern ensures exactly one pool exists per process. In our
 * clustered setup (server.ts forks N worker processes), each process calls
 * getDbConnection() independently and gets its own pool — which is correct
 * because OS processes have separate memory spaces and cannot share sockets.
 *
 * Pool sizing:
 *   - min: 2 (keep at least 2 connections warm to avoid cold-start latency)
 *   - max: 10 (don't overwhelm PostgreSQL; default max_connections is 100,
 *     and we may have N cluster workers each with max 10 = N*10 total)
 *
 * `destroyDbConnection()` is called during graceful shutdown (SIGTERM)
 * to cleanly close all connections before the process exits.
 */
import knex, { Knex } from 'knex';
import { config } from '@core/config';
import { logger } from '@core/logger';

let instance: Knex | null = null;
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
