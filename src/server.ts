/**
 * Server Entry Point — Clustering & Graceful Shutdown
 * Layer: Entry Point (top of the dependency tree)
 *
 * This is the file that starts when you run `npm start` or `npm run dev`.
 * It uses Node.js's built-in `cluster` module to create multiple copies
 * of the HTTP server — one per CPU core.
 *
 * Think of it as a **restaurant with a head chef and line cooks**:
 *   - The PRIMARY process (head chef) doesn't serve any HTTP requests itself.
 *     It forks N worker processes and monitors them. If a worker crashes,
 *     the primary automatically spawns a replacement.
 *   - Each WORKER process (line cook) runs its own Express app with its own
 *     DB connection pool. They all share the same port — the OS kernel
 *     load-balances incoming connections across them (round-robin on Linux,
 *     random on Windows/macOS).
 *
 * Why cluster?
 *   Node.js is single-threaded — one process can only use one CPU core.
 *   On a 4-core machine, a single process leaves 75% of CPU capacity idle.
 *   Clustering creates 4 processes so all cores are utilised. Each process
 *   handles requests independently, achieving near-linear throughput scaling.
 *
 * Graceful shutdown:
 *   On SIGTERM/SIGINT (e.g., Ctrl+C or container stop), each worker:
 *     1. Stops accepting new connections (server.close()).
 *     2. Waits for in-flight requests to finish.
 *     3. Destroys the DB connection pool (releases connections back to PG).
 *     4. Exits cleanly with code 0.
 */
import cluster from 'node:cluster';
import os from 'node:os';

import { config } from '@core/config';
import { logger } from '@core/logger';
import { destroyDbConnection } from '@infrastructure/database/connection';
import { createApp } from '@interfaces/http/app';

const numWorkers = config.cluster.workers || os.cpus().length;

if (cluster.isPrimary) {
  logger.info(
    { pid: process.pid, workers: numWorkers },
    `Primary process starting >> forking ${numWorkers} workers`,
  );

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn({ pid: worker.process.pid, code, signal }, 'Worker died — restarting');
    cluster.fork();
  });
} else {
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info({ pid: process.pid, port: config.port }, `Worker listening on :${config.port}`);
  });

  // Graceful shutdown: stop accepting new connections, drain existing ones,
  // then tear down the DB pool.
  const shutdown = async (signal: string) => {
    logger.info({ pid: process.pid, signal }, 'Graceful shutdown initiated');
    server.close(async () => {
      await destroyDbConnection();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
