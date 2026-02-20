/**
 * Search Service — Single Entry Point for Search
 * Layer: Application
 * Pattern: Facade (simplifies access to the search subsystem)
 *
 * I treat this as the only place the controller talks to for search: it calls
 * search() or findByAbn(). For search(), I resolve the right strategy (native
 * vs optimized) via the factory and delegate — so the HTTP layer never cares
 * which algorithm runs, which will help when we add AI search. findByAbn() is
 * a direct key lookup, so I keep it here and throw NotFoundError (404) when
 * the ABN doesn’t exist. The service is @injectable and resolved via
 * TOKENS.SearchService.
 */
import type { SearchStrategyFactory } from '@application/factories/SearchStrategyFactory';
import { TOKENS } from '@core/types';
import type { Business } from '@domain/entities/Business';
import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';
import { NotFoundError } from '@shared/errors/AppError';
import type { PaginatedResult, SearchQuery } from '@shared/types';
import { inject, injectable } from 'tsyringe';

@injectable()
export class SearchService {
  constructor(
    @inject(TOKENS.BusinessRepository) private repo: IBusinessRepository,
    @inject(TOKENS.SearchStrategyFactory) private strategyFactory: SearchStrategyFactory,
  ) {}

  async search(query: SearchQuery): Promise<PaginatedResult<Business>> {
    const strategy = this.strategyFactory.create(query);
    return strategy.execute(query);
  }

  async findByAbn(abn: string): Promise<{ business: Business; queryTimeMs: number }> {
    const { business, queryTimeMs } = await this.repo.findByAbn(abn);
    if (!business) throw new NotFoundError('Business', abn);
    return { business, queryTimeMs };
  }
}
