/**
 * Ingestion Service — Facade over the ETL Subsystem
 * Layer: Application
 * Pattern: Facade Pattern
 *
 * The Facade Pattern hides complex machinery behind a simple interface —
 * like a car's ignition button that starts the engine, fuel pump, and
 * electronics all at once. Here, calling `ingest(filePath)` hides:
 *   - Spawning a Worker Thread (separate V8 isolate)
 *   - Streaming XML through a SAX parser
 *   - Normalizing records via the Adapter
 *   - Batching and bulk-upserting into PostgreSQL
 *
 * Why a Worker Thread?
 *   Node.js is single-threaded — parsing a 580MB XML file on the main thread
 *   would block the HTTP server for minutes, making the API unresponsive.
 *   Worker threads run in a separate V8 isolate with their own event loop,
 *   so the main thread stays free to serve HTTP requests.
 *
 * Communication model:
 *   Main thread → Worker: workerData (filePath, dbConfig, batchSize)
 *   Worker → Main thread: postMessage({ type: 'progress' | 'done' | 'error' })
 *
 * The `execArgv: ['--require', 'tsx/cjs']` tells the worker's Node.js
 * process to preload the tsx transpiler, so it can execute .ts files
 * directly without a prior build step.
 */
import { inject, injectable } from 'tsyringe';
import { Worker } from 'worker_threads';
import path from 'path';
import { TOKENS } from '@core/types';
import type { Logger } from '@core/logger';
import { config } from '@core/config';
import type { IngestionResult } from '@shared/types';
import { AppError } from '@shared/errors/AppError';
@injectable()
export class IngestionService {
  constructor(@inject(TOKENS.Logger) private log: Logger) {}

  async ingest(filePath: string): Promise<IngestionResult> {
    const absolutePath = path.resolve(filePath);
    this.log.info({ filePath: absolutePath }, 'Starting ETL ingestion');

    return new Promise<IngestionResult>((resolve, reject) => {
      const worker = new Worker(path.resolve(__dirname, '../../workers/etl/etlWorker.ts'), {
        workerData: {
          filePath: absolutePath,
          dbConfig: config.database,
          batchSize: config.etl.batchSize,
        },
        execArgv: ['--require', 'tsx/cjs'],
      });

      worker.on('message', (msg: { type: string; [key: string]: unknown }) => {
        switch (msg.type) {
          case 'progress':
            this.log.info({ processed: msg.processed }, 'ETL progress');
            break;
          case 'done':
            this.log.info(msg.result as Record<string, unknown>, 'ETL ingestion complete');
            resolve(msg.result as IngestionResult);
            break;
          case 'error':
            this.log.error({ error: msg.message }, 'ETL worker error');
            reject(new AppError(`ETL failed: ${msg.message}`, 500));
            break;
        }
      });

      worker.on('error', (err: Error) => {
        this.log.error({ err }, 'ETL worker thread error');
        reject(new AppError(`ETL worker crashed: ${err.message}`, 500));
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new AppError(`ETL worker exited with code ${code}`, 500));
        }
      });
    });
  }
}
