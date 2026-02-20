/**
 * Ingestion Controller — HTTP Trigger for ETL
 * Layer: Interfaces (HTTP)
 *
 * I expose one endpoint: POST with filePath in the body. I validate and
 * pass through to IngestionService; the worker thread does the real work.
 * In production I’d add auth (e.g. admin-only) since ETL is expensive.
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
