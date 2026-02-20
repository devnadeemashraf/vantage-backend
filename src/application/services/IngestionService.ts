/**
 * Ingestion Service — Facade over the ETL Subsystem
 * Layer: Application
 * Pattern: Facade Pattern
 *
 * I expose a single method ingest(filePath) so the controller (or seed script)
 * doesn’t deal with worker threads, SAX, or batching. Inside we spawn a worker
 * thread, stream the XML, normalize via the adapter, and bulk-upsert — all
 * off the main thread so the API stays responsive during a 580MB parse.
 *
 * Main → worker: workerData (filePath, dbConfig, batchSize). Worker → main:
 * postMessage with type 'progress', 'done', or 'error'. I use execArgv to
 * preload tsx so the worker can run .ts files without a separate build.
 */
import { config } from '@core/config';
import type { Logger } from '@core/logger';
import { TOKENS } from '@core/types';
import { AppError } from '@shared/errors/AppError';
import type { IngestionResult } from '@shared/types';
import path from 'path';
import { inject, injectable } from 'tsyringe';
import { Worker } from 'worker_threads';

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
