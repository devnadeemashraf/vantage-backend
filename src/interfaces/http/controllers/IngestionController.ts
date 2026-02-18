/**
 * Ingestion Controller — HTTP Trigger for ETL Pipeline
 * Layer: Interfaces (HTTP)
 *
 * Provides an HTTP endpoint to kick off data ingestion. The controller
 * extracts the file path from the request body, validates it, and delegates
 * to the IngestionService which handles spawning the worker thread.
 *
 * This is intentionally a simple pass-through — the heavy lifting (XML
 * parsing, batching, upserting) all happens in the worker thread via the
 * IngestionService facade. The controller just bridges HTTP ↔ Application.
 *
 * In production, you'd likely protect this endpoint with authentication
 * middleware (admin-only) since triggering a full ETL run is an expensive
 * operation.
 */
import { IngestionService } from '@application/services/IngestionService';
import { container } from '@core/container';
import { TOKENS } from '@core/types';
import { ValidationError } from '@shared/errors/AppError';
import type { Request, Response } from 'express';

export class IngestionController {
  private service: IngestionService;

  constructor() {
    this.service = container.resolve(TOKENS.IngestionService) as IngestionService;
  }

  ingest = async (req: Request, res: Response): Promise<void> => {
    const { filePath } = req.body as { filePath?: string };

    if (!filePath) {
      throw new ValidationError('filePath is required in the request body');
    }

    const result = await this.service.ingest(filePath);
    res.status(200).json({ status: 'success', data: result });
  };
}
