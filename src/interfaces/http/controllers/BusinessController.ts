import type { Request, Response } from 'express';
import { container } from '@core/container';
import { TOKENS } from '@core/types';
import { SearchService } from '@application/services/SearchService';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@shared/constants';

export class BusinessController {
  private service: SearchService;

  constructor() {
    this.service = container.resolve(TOKENS.SearchService) as SearchService;
  }

  search = async (req: Request, res: Response): Promise<void> => {
    const {
      q,
      state,
      postcode,
      entityType,
      abnStatus,
      page = '1',
      limit = String(DEFAULT_PAGE_SIZE),
      mode = 'standard',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit, 10) || DEFAULT_PAGE_SIZE));

    const result = await this.service.search({
      term: q || undefined,
      state: state || undefined,
      postcode: postcode || undefined,
      entityType: entityType || undefined,
      abnStatus: abnStatus || undefined,
      page: pageNum,
      limit: limitNum,
      mode: mode as 'standard' | 'ai',
    });

    res.status(200).json({ status: 'success', ...result });
  };

  findByAbn = async (req: Request, res: Response): Promise<void> => {
    const { abn } = req.params;
    const result = await this.service.findByAbn(abn as string);
    res.status(200).json({ status: 'success', data: result });
  };
}
