/**
 * Seed CLI Script — Standalone Data Ingestion Tool
 * Layer: Entry Point (CLI, not HTTP)
 *
 * This script is the primary way to load ABR XML data into the database.
 * It runs directly from the terminal (not through the HTTP server) via:
 *
 *   npm run seed                                               # default file
 *   npm run seed -- --file ./temp/data/20260211_Public20.xml   # custom file
 *   npm run seed -- --migrate                                  # run migrations first
 *
 * What it does:
 *   1. Validates the XML file exists and prints its size.
 *   2. Optionally runs database migrations (--migrate flag).
 *   3. Spawns the ETL worker thread (same one used by the HTTP ingestion
 *      endpoint) and streams progress to the console in real-time.
 *   4. On completion, prints a summary with total records, duration, and
 *      average throughput (records per second).
 *
 * Why a standalone script instead of just the HTTP endpoint?
 *   - Initial data seeding (580MB+) can take minutes. A CLI script gives
 *     you real-time progress feedback, doesn't depend on the HTTP server
 *     being up, and can be run in CI/CD pipelines or cron jobs.
 *   - The HTTP endpoint is better for on-demand incremental ingestion
 *     triggered by an admin UI.
 *
 * The script reuses the exact same ETL worker thread (etlWorker.ts) and
 * BatchProcessor as the HTTP path — no code duplication.
 */
import 'dotenv/config';

import { config } from '@core/config';
import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';

// CLI argument parsing

const args = process.argv.slice(2);

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const hasFlag = (flag: string): boolean => args.includes(flag);

const defaultFile = path.resolve(config.etl.dataDir, '20260211_Public20_Sample.xml');
const filePath = path.resolve(getArg('--file', defaultFile));
const runMigrations = hasFlag('--migrate');

// Helpers

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  if (ms < 60_000) return `${seconds}s`;
  const minutes = Math.floor(ms / 60_000);
  const remainingSec = ((ms % 60_000) / 1000).toFixed(0);
  return `${minutes}m ${remainingSec}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// Main

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  const log = console.log;

  log('');
  log('╔══════════════════════════════════════════════════╗');
  log('║           Vantage — ETL Seed Script              ║');
  log('╚══════════════════════════════════════════════════╝');
  log('');

  // Validate file exists
  if (!fs.existsSync(filePath)) {
    log(`  ERROR: File not found: ${filePath}`);
    log('  Use --file <path> to specify the XML file.');
    process.exit(1);
  }

  const fileSize = fs.statSync(filePath).size;
  log(`  File:       ${filePath}`);
  log(`  Size:       ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
  log(`  Batch size: ${formatNumber(config.etl.batchSize)}`);
  log(`  Database:   ${config.database.host}:${config.database.port}/${config.database.name}`);
  log('');

  // Optionally run migrations
  if (runMigrations) {
    log('  Running migrations...');
    const knex = (await import('knex')).default;
    const db = knex({
      client: 'pg',
      connection: {
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        user: config.database.user,
        password: config.database.password,
      },
    });
    await db.migrate.latest({
      directory: path.resolve(__dirname, '../infrastructure/database/migrations'),
    });
    await db.destroy();
    log('  Migrations complete.');
    log('');
  }

  // Spawn ETL worker
  log('  Starting ingestion...');
  log('');

  const startTime = Date.now();
  let lastProgressTime = startTime;
  let lastProgressCount = 0;

  return new Promise<void>((resolve, reject) => {
    const worker = new Worker(path.resolve(__dirname, '../workers/etl/etlWorker.ts'), {
      workerData: {
        filePath,
        dbConfig: config.database,
        batchSize: config.etl.batchSize,
      },
      execArgv: ['--require', 'tsx/cjs'],
    });

    worker.on('message', (msg: { type: string; [key: string]: unknown }) => {
      switch (msg.type) {
        case 'progress': {
          const processed = msg.processed as number;
          const now = Date.now();
          const intervalMs = now - lastProgressTime;
          const intervalRecords = processed - lastProgressCount;
          const rps = intervalMs > 0 ? Math.round((intervalRecords / intervalMs) * 1000) : 0;
          const elapsed = formatDuration(now - startTime);

          log(
            `  [${elapsed}] ${formatNumber(processed)} records processed (${formatNumber(rps)} rec/s)`,
          );

          lastProgressTime = now;
          lastProgressCount = processed;
          break;
        }
        case 'done': {
          const result = msg.result as {
            totalProcessed: number;
            durationMs: number;
          };
          const avgRps = Math.round((result.totalProcessed / result.durationMs) * 1000);

          log('');
          log('  ✓ Ingestion complete');
          log(`    Total records:  ${formatNumber(result.totalProcessed)}`);
          log(`    Duration:       ${formatDuration(result.durationMs)}`);
          log(`    Avg throughput: ${formatNumber(avgRps)} rec/s`);
          log('');
          resolve();
          break;
        }
        case 'error':
          log(`  ERROR: ${msg.message}`);
          reject(new Error(String(msg.message)));
          break;
      }
    });

    worker.on('error', (err: Error) => {
      log(`  WORKER ERROR: ${err.message}`);
      reject(err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
