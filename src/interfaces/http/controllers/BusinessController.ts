/**
 * Business Controller — HTTP Request Handler for Search & Lookup
 * Layer: Interfaces (HTTP)
 *
 * Controllers are the **thin boundary** between HTTP and the application.
 * Their only job is to:
 *   1. Extract data from the HTTP request (query params, path params, body).
 *   2. Call the appropriate service method.
 *   3. Format and send the HTTP response.
 *
 * They should contain NO business logic — no database queries, no search
 * algorithms, no data transformation. If you find yourself writing an `if`
 * that involves business rules in a controller, it belongs in a service.
 *
 * The controller resolves SearchService from the DI container at construction
 * time, so it's fully decoupled from the service's dependencies (repository,
 * strategies, etc.).
 *
 * Arrow-function methods (search = async ...) are used instead of regular
 * methods so that `this` is lexically bound — Express can call them as
 * standalone callbacks without losing the class context.
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
