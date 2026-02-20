/**
 * Server Entry Point — Clustering & Graceful Shutdown
 * Layer: Entry Point (top of the dependency tree)
 *
 * This is what runs on `npm start` / `npm run dev`. I use the cluster module
 * so we run one HTTP worker per CPU core; the primary only forks and restarts
 * workers, it doesn’t serve traffic. Each worker has its own Express app and
 * DB pool and shares the same port (OS load-balances). On SIGTERM/SIGINT I
 * close the server, drain in-flight requests, destroy the pool, then exit 0.
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
