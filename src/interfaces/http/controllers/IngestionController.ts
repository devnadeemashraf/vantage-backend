import type { Request, Response } from 'express';
import { container } from '@core/container';
import { TOKENS } from '@core/types';
import { IngestionService } from '@application/services/IngestionService';
import { ValidationError } from '@shared/errors/AppError';

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
