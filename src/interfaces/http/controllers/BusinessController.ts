/**
 * Business Controller — HTTP Boundary for Search & Lookup
 * Layer: Interfaces (HTTP)
 *
 * I keep this thin: read query/path params, call SearchService, send JSON.
 * No business logic or DB access here — that stays in the service. I
 * resolve SearchService from the container in the constructor. Arrow
 * functions (search = async ...) keep `this` bound when Express invokes
 * them as route handlers.
 */
import { SearchService } from '@application/services/SearchService';
import { container } from '@core/container';
import { TOKENS } from '@core/types';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@shared/constants';
import type { Request, Response } from 'express';

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
      technique = 'native',
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
      technique: technique as 'native' | 'optimized',
    });

    const totalTimeMs =
      req.requestStartTime != null ? Math.round(Date.now() - req.requestStartTime) : undefined;
    const meta = {
      ...result.meta,
      ...(totalTimeMs != null && { totalTimeMs }),
    };

    res.status(200).json({
      status: 'success',
      ...result,
      ...(Object.keys(meta).length > 0 && { meta }),
    });
  };

  findByAbn = async (req: Request, res: Response): Promise<void> => {
    const { abn } = req.params;
    const { business, queryTimeMs } = await this.service.findByAbn(abn as string);

    const totalTimeMs =
      req.requestStartTime != null ? Math.round(Date.now() - req.requestStartTime) : undefined;
    const meta =
      totalTimeMs != null || queryTimeMs != null ? { totalTimeMs, queryTimeMs } : undefined;

    res.status(200).json({
      status: 'success',
      data: business,
      ...(meta != null && { meta }),
    });
  };
}
